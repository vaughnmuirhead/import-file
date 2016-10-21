import arcpy, os, zipfile, csv, traceback, json

Projections = {
  "MGA50": 'PROJCS["GDA_1994_MGA_Zone_50",GEOGCS["GCS_GDA_1994",DATUM["D_GDA_1994",SPHEROID["GRS_1980",6378137.0,298.257222101]],PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433]],PROJECTION["Transverse_Mercator"],PARAMETER["False_Easting",500000.0],PARAMETER["False_Northing",10000000.0],PARAMETER["Central_Meridian",117.0],PARAMETER["Scale_Factor",0.9996],PARAMETER["Latitude_Of_Origin",0.0],UNIT["Meter",1.0],AUTHORITY["EPSG",28350]]',
  "MGA51": 'PROJCS["GDA_1994_MGA_Zone_51",GEOGCS["GCS_GDA_1994",DATUM["D_GDA_1994",SPHEROID["GRS_1980",6378137.0,298.257222101]],PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433]],PROJECTION["Transverse_Mercator"],PARAMETER["False_Easting",500000.0],PARAMETER["False_Northing",10000000.0],PARAMETER["Central_Meridian",123.0],PARAMETER["Scale_Factor",0.9996],PARAMETER["Latitude_Of_Origin",0.0],UNIT["Meter",1.0],AUTHORITY["EPSG",28351]]',
  "GDA94 Lat Long": 'GEOGCS["GCS_GDA_1994",DATUM["D_GDA_1994",SPHEROID["GRS_1980",6378137.0,298.257222101]],PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433],AUTHORITY["EPSG",4283]]',
  "WGS84": 'GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",SPHEROID["WGS_1984",6378137.0,298.257223563]],PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433],AUTHORITY["EPSG",4326]]'
}


def main():
  InputFile = arcpy.GetParameterAsText(0)
  userSpecifiedProjection = arcpy.GetParameterAsText(1)
  target = arcpy.GetParameterAsText(2)

  arcpy.env.overwriteOutput = True

  # Example target input value for saving data to SDE feature class: "\\entper-fil01\AppsData\IOAGS_config\AGS_Test\ConnectionFiles\PUBLISH\GIS_EDIT@IO_SDI_PUBLISH_TST@IORPER-GSDT01.sde\IO_SDI_PUBLISH_TST.GCC.SurveyAOI"

  Log("Input File : " + InputFile)

  if not userSpecifiedProjection or userSpecifiedProjection == None:
    userSpecifiedProjection = "WGS84"

  Log("Input Projection : " + userSpecifiedProjection)
  InputSpatialReference = RetrieveSpatialReference(userSpecifiedProjection)

  if not InputSpatialReference:
    raise arcpy.ExecuteError("Unknown spatial reference : " + userSpecifiedProjection)

  try:
    uploadedExt = os.path.basename(InputFile).split('.')[
      -1].lower()  # extension of uploaded file. remove "." and make string lowercase
    Log("File Extension : " + uploadedExt)

    ResultsArray = {"Name": os.path.basename(InputFile), "Layers": []}
    Results = None

    if uploadedExt == "zip":

      FileList = GetZIPFileList(InputFile)

      if len(FileList) == 0:
        raise arcpy.ExecuteError("No files found to process in ZIP archive.  Expecting SHP or DXF file.")

      file_data = {}
      for File in FileList:
        FileExtension = os.path.basename(File).split('.')[-1].lower()
        if FileExtension == "dxf" or FileExtension == "shp":
          file_data['type'] = FileExtension
          file_data['file'] = File
        elif FileExtension == "prj":
          file_data['prj'] = File


      if file_data['type'] == "dxf":
        Results = ImportDXF(file_data['file'], InputSpatialReference)

      elif file_data['type'] == "shp":
        if (target):
          fc = file_data['file']
          save_to_target(fc, target)

        #Results = ImportShapeFile(file_data['file'], InputSpatialReference, target)
        out_sr = arcpy.SpatialReference(3857) #get sr for web mercator
        Results = [autoProject(file_data['file'], out_sr)]

    elif uploadedExt == "csv":
      Results = ImportCSV(InputFile, InputSpatialReference)

    elif uploadedExt == "dxf":
      Results = ImportDXF(InputFile, InputSpatialReference, target)

    Log("Items to process : {0}".format(str(len(Results))))

    if Results:
      for FeatureClass in Results:
        FeatureSet = arcpy.FeatureSet()
        FeatureSet.load(FeatureClass)
        Desc = arcpy.Describe(FeatureClass)
        Name = Desc.shapeType
        ResultsArray["Layers"].append({"Name": Name, "FeatureSet": FeatureSet.JSON})

      Log("Conversion complete.")

    if len(ResultsArray["Layers"]) == 0:
      # There was nothing to return
      ResultsArray["Layers"].append({"Name": "Conversion Error", "FeatureSet": ""})

    ResultsJSON = json.dumps(ResultsArray)

    arcpy.SetParameterAsText(3, ResultsJSON)
    arcpy.SetParameterAsText(4, "File imported successfully.")

  except Exception, e:
    Log("Error with conversion: " + traceback.format_exc())
    ResultsArray["Layers"].append({"Name": "Conversion Error", "FeatureSet": ""})
    ResultsJSON = json.dumps(ResultsArray)
    arcpy.SetParameterAsText(3, ResultsJSON)
    arcpy.SetParameterAsText(4, traceback.format_exc())
    raise arcpy.ExecuteError(traceback.format_exc())


def Log(Message):
  arcpy.AddMessage(Message)


def GetZIPFileList(ZIPFile):
  z = zipfile.ZipFile(ZIPFile)
  z.testzip()
  extractDir = arcpy.CreateUniqueName("Extracted", arcpy.env.scratchFolder)
  z.extractall(extractDir)
  ZipFileList = os.listdir(extractDir)
  FileList = []

  for f in ZipFileList:
    ext = os.path.basename(f).split('.')[-1].lower()
    if ext == 'dxf':
      FileList.append(os.path.join(extractDir, f))
    elif ext == 'shp':
      FileList.append(os.path.join(extractDir, f))
    elif ext == 'prj':
      FileList.append(os.path.join(extractDir, f))

  return FileList


def GetCSV_XYColumnNames(CSVFile):
  XField = None
  YField = None
  ValidXFields = ['x', 'lon', 'long', 'longitude']
  ValidYFields = ['y', 'lat', 'latitude']
  text_file = open(CSVFile, "r")
  CSVLines = text_file.read().splitlines()
  text_file.close()
  if len(CSVLines) > 0:
    Headers = CSVLines[0].split(",")
    for HeaderField in Headers:
      if not XField:
        if HeaderField.lower() in ValidXFields:
          XField = HeaderField

      if not YField:
        if HeaderField.lower() in ValidYFields:
          YField = HeaderField

      if XField and YField:
        break

  return XField, YField


def ImportCSV(CSVFile, CSVSpatialReference):
  Log("Processing CSV File...")
  out_Layername = "CSV_Layer"

  X_ColName, Y_ColName = GetCSV_XYColumnNames(CSVFile)

  if not X_ColName:
    raise arcpy.ExecuteError("No X field found in CSV file.")

  if not Y_ColName:
    raise arcpy.ExecuteError("No Y field found in CSV file.")

  # Make the XY event layer...
  out_Layer = arcpy.MakeXYEventLayer_management(CSVFile, X_ColName, Y_ColName, out_Layername, CSVSpatialReference)

  CSVOutput = arcpy.CreateUniqueName("CSVData", arcpy.env.scratchGDB)
  arcpy.FeatureClassToFeatureClass_conversion(out_Layername, os.path.dirname(CSVOutput), os.path.basename(CSVOutput))

  return [projectToWebMercator(CSVOutput, arcpy.env.scratchGDB, CSVSpatialReference)]


def GetDatasetFeatureClasses(Dataset):
  ResultList = []
  arcpy.env.workspace = os.path.dirname(Dataset)
  for fc in arcpy.ListFeatureClasses('', '', os.path.basename(Dataset)):
    if arcpy.Describe(fc).shapeType == "MultiPatch":
      continue

    if arcpy.Describe(fc).featureType == "Annotation":
      continue

    ResultList.append(os.path.join(Dataset, fc))

  return ResultList


def ImportDXF(DXFFile, DXFSpatialReference, target=None):
  Log("Processing DXF File...")
  output_dataset = arcpy.CreateUniqueName("ConvertedDXF", arcpy.env.scratchGDB)

  arcpy.CADToGeodatabase_conversion(DXFFile, arcpy.env.scratchGDB, os.path.basename(output_dataset),
                                    DXFSpatialReference.scaleFactor, DXFSpatialReference)

  #ProjectedDataset = projectToWebMercator(output_dataset, arcpy.env.scratchGDB, DXFSpatialReference)

  out_sr = arcpy.SpatialReference(3857) #3857 webmercator for display on web map.
  ProjectedDataset = autoProject(output_dataset, out_sr)

  feature_classes = GetDatasetFeatureClasses(ProjectedDataset)

  if(target):
    for fc in feature_classes:
      save_to_target(fc, target)

  return feature_classes


# def ImportShapeFile(SHPFile, SHPSpatialReference):
#   Log("Processing Shapefile...")
#   ConvertedShapefile = arcpy.CreateUniqueName("ConvertedShapeFile", arcpy.env.scratchGDB)
#
#   arcpy.FeatureClassToFeatureClass_conversion(SHPFile, arcpy.env.scratchGDB, os.path.basename(ConvertedShapefile))
#   arcpy.DefineProjection_management(ConvertedShapefile, SHPSpatialReference)
#
#   return [projectToWebMercator(ConvertedShapefile, arcpy.env.scratchGDB, SHPSpatialReference)]


def save_to_target(in_fc, target):
  Log("Appending input...")
  out_sr = arcpy.Describe(target).spatialReference
  in_fc_reproject = autoProject(in_fc, out_sr)
  arcpy.Append_management([in_fc_reproject], target, "NO_TEST")
  Log("Input appended successfully.")


def projectToWebMercator(in_fc, tempWorkspace, sr):
  WGSAuxSphere = arcpy.SpatialReference(3857)  # web Mercator aux sphere
  out_fc = arcpy.CreateUniqueName("ReprojectedTemp", tempWorkspace)

  Log("Reprojecting from {0} to {1}...".format(sr.name, WGSAuxSphere.name))
  arcpy.Project_management(in_fc, out_fc, WGSAuxSphere, in_coor_system=sr)
  return out_fc


def autoProject(in_fc, out_sr):

  #accepts input feature class and output spatial reference object and reprojects.

  in_sr = arcpy.Describe(in_fc).spatialReference
  out_fc = arcpy.CreateUniqueName("ReprojectedTemp", arcpy.env.scratchGDB)
  if in_sr.name == out_sr.name:
    Log("Input is has the same spatial reference as target.")
    return in_fc #Don't reproject if not necessary.

  Log("Reprojecting from {0} to {1}...".format(in_sr.name, out_sr.name))
  arcpy.Project_management(in_fc, out_fc, out_sr, in_coor_system=in_sr)
  return out_fc


def find_between(s, first, last):
  try:
    start = s.index(first) + len(first)
    end = s.index(last, start)
    return s[start:end]
  except ValueError:
    return ""


def RetrieveSpatialReference(in_prj):
  global Projections
  LookupValue = find_between(in_prj, "(", ")")
  if LookupValue in Projections:
    Spatref = arcpy.SpatialReference()
    Spatref.loadFromString(Projections[LookupValue])
    return Spatref


if __name__ == "__main__":
  main()
