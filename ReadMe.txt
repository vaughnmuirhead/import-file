Import File
--------------------------------------------------------------

The import file custom widget is a Web AppBuilder Developer Edition custom widget that allows a user to upload and visualise the following file types:
DXF, SHP(Zipped), CSV.

The WAB widget is based on the OOTB Geoprocessing widget.

Dependencies
*  ArcGIS for Server 10.3.1+
*  Web AppBuilder Developer Edition 1.3, 2.0
*  ArcGIS for Desktop 10.3.1+


Deployment
1.	Using ArcGIS Desktop, run the ImportFile tool with a sample file (CSV, ZIP, DXF)
2.	Publish the results as a Geoprocessing service in ArcGIS Server
3.	Check the Uploads checkbox to allow file uploads to the GP tool.
4.	Set the permissions of the GP service in ArcGIS Server. 
5.	Deploy the custom widget "ImportFile" to WAB by copying it into the <wabfolder>\client\stemapp\widgets\
6.	Restart the WAB service or restart the startup.bat file used to run WAB.  The widget will now be available to use in applications.
7.	Open WAB and open an application.
8.	Go to Widgets and add the ImportFile widget
9.	When prompted for a GP URL, enter the published GP rest URL as published in step 2
