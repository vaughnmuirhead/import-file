# import-file
A custom widget for ESRI's web appbuilder product that allows a user to import spatial data from a file.

## Supported Upload types
Currently supports upload of SHP(Zipped), CSV and DXF.

## Notes
The WAB widget is based on the OOTB Geoprocessing widget.

## Dependencies
*  ArcGIS for Server 10.3.1+
*  Web AppBuilder Developer Edition 1.3, 2.0
*  ArcGIS for Desktop 10.3.1+

## Development
Follow instructions from the generator-esri-appbuilder-js project https://github.com/Esri/generator-esri-appbuilder-js to:
* Create a package.json
* Install yeoman generator
* Generate Gruntfile etc.

## Deployment
*	Using ArcGIS Desktop, run the ImportFile tool with a sample file (CSV, ZIP, DXF)
*	Publish the results as a Geoprocessing service in ArcGIS Server.  Important:  Publish Geoprocessing service as SYNCHRONOUS.
*	Check the Uploads checkbox to allow file uploads to the GP tool.
*	Set the permissions of the GP service in ArcGIS Server.
*	Deploy the custom widget "ImportFile" to WAB by copying it into the <wabfolder>\client\stemapp\widgets\
*	Restart the WAB service or restart the startup.bat file used to run WAB.  The widget will now be available to use in applications.
*	Open WAB and open an application.
*	Go to Widgets and add the ImportFile widget
*	When prompted for a GP URL, enter the published GP rest URL as published in step 2


