///////////////////////////////////////////////////////////////////////////
// Copyright © 2014 Esri. All Rights Reserved.
//
// Licensed under the Apache License Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//    http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
///////////////////////////////////////////////////////////////////////////

define(['dojo/_base/declare', 'dojo/_base/lang', 'dojo/_base/array', 'dojo/_base/html', 'dojo/on', 'dojo/Deferred', 'dojo/promise/all', 'jimu/BaseWidget', 'jimu/dijit/TabContainer', 'jimu/dijit/LoadingIndicator', 'jimu/dijit/Message', 'jimu/utils', './editorManager', './resultRendererManager', 'esri/tasks/GPMessage', 'esri/tasks/Geoprocessor', 'esri/tasks/JobInfo', 'esri/layers/ImageParameters', 'esri/request', 'esri/geometry/Extent', 'esri/graphicsUtils', 'esri/layers/layer', 'esri/renderers/SimpleRenderer', 'esri/symbols/SimpleMarkerSymbol', 'esri/symbols/SimpleLineSymbol', 'esri/symbols/SimpleFillSymbol', 'jimu/LayerInfos/LayerInfos', 'esri/Color', './utils'], function (declare, lang, array, html, on, Deferred, all, BaseWidget, TabContainer, LoadingIndicator, Message, utils, editorManager, resultRendererManager, GPMessage, Geoprocessor, JobInfo, ImageParameters, esriRequest, Extent, graphicsUtils, layer, SimpleRenderer, SimpleMarkerSymbol, SimpleLineSymbol, SimpleFillSymbol, LayerInfos, Color, gputils) {
  var clazz = declare([BaseWidget], {
    //these two properties is defined in the BaseWidget
    baseClass: 'jimu-widget-geoprocessing',
    name: 'ImportFile',

    startup: function startup() {
      this.inherited(arguments);

      if (!this.config.taskUrl) {
        html.setStyle(this.toolNode, 'display', 'none');
        html.setStyle(this.errorNode, 'display', '');
        return;
      }
      this.inputNodes = [];
      this.drawTools = [];

      //each result will be displayed by dijit
      this.resultNodes = [];
      this.resultLayers = [];

      editorManager.setMap(this.map);
      editorManager.setNls(this.nls);

      resultRendererManager.setMap(this.map);
      resultRendererManager.setNls(this.nls);

      this.gp = new Geoprocessor(this.config.taskUrl);
      this.gp.setOutSpatialReference(this.map.spatialReference);

      if (this.config.updateDelay) {
        this.gp.setUpdateDelay(this.config.updateDelay);
      }

      this.tab = new TabContainer({
        tabs: [{
          title: this.nls.input,
          content: this.inputPaneNode
        }, {
          title: this.nls.output,
          content: this.outputPaneNode
        }],
        selected: this.nls.input
      });
      this.tab.placeAt(this.domNode);
      this.tab.startup();

      this.loading = new LoadingIndicator({
        hidden: true
      }, this.loadingNode);
      this.loading.startup();

      //Fires when a synchronous GP task is completed
      this.own(on(this.gp, 'execute-complete', lang.hitch(this, this.onExecuteComplete)));

      //Fires when an asynchronous GP task using submitJob is complete.
      this.own(on(this.gp, 'job-complete', lang.hitch(this, this.onJobComplete)));

      this.own(on(this.gp, 'job-cancel', lang.hitch(this, this.onJonCancel)));

      //Fires when a job status update is available.
      this.own(on(this.gp, 'status-update', lang.hitch(this, this.onStatusUpdate)));

      //Fires when the result of an asynchronous GP task execution is available.
      this.own(on(this.gp, 'get-result-data-complete', lang.hitch(this, this.onGetResultDataComplate)));

      //Fires when a map image is generated by invoking the getResultImage method.
      this.own(on(this.gp, 'get-result-image-layer-complete', lang.hitch(this, this.onGetResultImageLayerComplate)));

      this.own(on(this.gp, 'error', lang.hitch(this, this.onError)));

      html.setAttr(this.helpLinkNode, 'href', this.config.helpUrl);

      this._generateUniqueID();
      if (!("serverInfo" in this.config)) {
        //Load gp server info if it does not exist.
        gputils.getServiceDescription(this.config.taskUrl).then(lang.hitch(this, function (taskInfo) {
          this.config.serverInfo = taskInfo.serverInfo;
          this._createInputNodes();
        }));
      } else {
        this._createInputNodes();
      }
    },

    executeGP: function executeGP() {
      this._clearLastResult();
      this._getInputParamValues().then(lang.hitch(this, function (inputValues) {
        this._showLoading();

        html.addClass(this.exeNode, 'jimu-state-disabled');
        console.log("Input values:");
        console.log(inputValues);
        if (this.config.isSynchronous) {
          this.gp.execute(inputValues);
        } else {
          this.gp.submitJob(inputValues);
        }
        this.tab.selectTab(this.nls.output);
      }));
    },

    onDeActive: function onDeActive() {
      array.forEach(this.drawTools, function (drawTool) {
        drawTool.deactivate();
      });
    },

    onExecuteComplete: function onExecuteComplete(results) {
      this._hideLoading();
      console.log("OnExecuteComplete");

      //show messages if there are warning or error
      var msgs;
      if (results.messages && results.messages.length > 0) {
        msgs = array.filter(results.messages, function (msg) {
          return msg.type === GPMessage.TYPE_WARNING || msg.type === GPMessage.TYPE_ERROR;
        });
        if (msgs.length > 0) {
          this._createErrorMessages(msgs);
        }
      }

      //the results.results is an array of ParameterValue,
      //because it contains one or more parameters
      this._createOutputNodes(results.results);

      html.removeClass(this.exeNode, 'jimu-state-disabled');
    },

    onJobComplete: function onJobComplete(jobInfo) {
      this._hideLoading();
      this.jobId = '';
      console.log("onJobComplete.");
      html.removeClass(this.exeNode, 'jimu-state-disabled');

      //onJobComplete is invoked even if jobStatus is STATUS_FAILED.
      //It hides this.infoNode so user can not see the error message!
      if (jobInfo.jobInfo.jobStatus !== JobInfo.STATUS_SUCCEEDED) {
        this._createErrorMessages(jobInfo.jobInfo.messages);
        return;
      }

      if (this.config.useResultMapServer) {
        //only when GP task is async and the GP service publish the result map service,
        //the option "useResultMapServer" may be true. This will be guaranteed in builder
        var imageParameters = new ImageParameters({
          imageSpatialReference: this.map.spatialReference
        });
        array.forEach(this.config.outputParams, function (param) {
          if (['GPFeatureRecordSetLayer', 'GPRasterDataLayer', 'GPRecordSet'].indexOf(param.dataType) > -1) {
            this.gp.getResultImageLayer(jobInfo.jobInfo.jobId, param.name, imageParameters);
          }
        }, this);
        array.forEach(this.config.outputParams, function (param) {
          if (['GPFeatureRecordSetLayer', 'GPRasterDataLayer', 'GPRecordSet'].indexOf(param.dataType) <= -1) {
            this.gp.getResultData(jobInfo.jobInfo.jobId, param.name);
          }
        }, this);
      } else {
        array.forEach(this.config.outputParams, function (param) {
          this.gp.getResultData(jobInfo.jobInfo.jobId, param.name);
        }, this);
      }
    },

    onJonCancel: function onJonCancel() {
      this.loading.hide();
      this.infoTextNode.innerHTML = 'Canceled';

      html.removeClass(this.exeNode, 'jimu-state-disabled');
      this.jobId = '';
    },

    onStatusUpdate: function onStatusUpdate(jobInfo) {
      this.jobId = jobInfo.jobInfo.jobId;
      if (jobInfo.jobInfo.jobStatus === JobInfo.STATUS_SUCCEEDED) {
        this._hideLoading();
      } else {
        this._showLoading(jobInfo.jobInfo.jobStatus);
      }
    },

    onGetResultDataComplate: function onGetResultDataComplate(result) {
      //the result.result contains only one ParameterValue
      this._createOutputNode(this._getOutputParamByName(result.result.paramName), result.result);
    },

    onGetResultImageLayerComplate: function onGetResultImageLayerComplate(result) {
      var lyr = result.layer;
      lyr.title = this._getResultImageLayerLabel(lyr.url);
      this.resultLayers.push(lyr);
      this.map.addLayer(lyr);
      if (lyr.fullExtent) {
        this.map.setExtent(lyr.fullExtent);
      } else {
        esriRequest({
          url: lyr.url,
          content: {
            f: 'json',
            imageSR: this.map.spatialReference.wkid
          },
          handleAs: "json",
          callbackParamName: 'callback'
        }).then(lang.hitch(this, function (layerInfo) {
          if (layerInfo.value.mapImage.extent) {
            var extent = new Extent(layerInfo.value.mapImage.extent);
            lyr.fullExtent = extent;
            this.map.setExtent(extent);
          }
        }));
      }
    },

    /**
     * Get the label of Result image layer name based on the url of the map
     * service.
     * @param  {string} url The map service url.
     * @return {string}     The result image layer name.
     */
    _getResultImageLayerLabel: function _getResultImageLayerLabel(url) {
      var layerName = url.substring(url.lastIndexOf('/') + 1);
      var ret = layerName;

      array.some(this.config.outputParams, function (outputParam) {
        if (outputParam.name === layerName) {
          ret = outputParam.label;
          return true;
        }
      }, this);

      return ret;
    },

    onError: function onError(error) {
      this.loading.hide();
      this.infoTextNode.innerHTML = utils.sanitizeHTML(error.error.message);

      html.removeClass(this.exeNode, 'jimu-state-disabled');

      this.jobId = '';
    },

    destroy: function destroy() {
      this._clearLastInput();
      this._clearLastResult();
      this.inherited(arguments);
    },

    _generateUniqueID: function _generateUniqueID() {
      this.uniqueID = this.id.replace(/[\/\.]/g, '_');
    },

    _showLoading: function _showLoading(text) {
      this.loading.show();
      html.setStyle(this.infoNode, 'display', 'block');
      this.infoTextNode.innerHTML = utils.sanitizeHTML(text ? text : this.nls.executing);
    },

    _hideLoading: function _hideLoading() {
      html.setStyle(this.infoNode, 'display', 'none');
      this.loading.hide();
    },

    _getOutputParamByName: function _getOutputParamByName(paramName) {
      for (var i = 0; i < this.config.outputParams.length; i++) {
        if (this.config.outputParams[i].name === paramName) {
          return this.config.outputParams[i];
        }
      }
    },

    _getInputParamValues: function _getInputParamValues() {
      var retDef = new Deferred(),
          retValues = {},
          defs = [],
          def,
          errorMessage = '';
      array.forEach(this.inputNodes, function (node) {
        def = node.inputEditor.getGPValue();
        def.param = node.param;
        defs.push(def);
      }, this);

      all(defs).then(lang.hitch(this, function (values) {
        for (var i = 0; i < values.length; i++) {
          if (defs[i].param.required && (values[i] === null || values[i] === undefined)) {
            errorMessage = defs[i].param.label + ' ' + this.nls.requiredInfo;
            new Message({
              message: errorMessage
            });
            retDef.reject(errorMessage);
            return;
          } else {
            retValues[defs[i].param.name] = values[i];
          }
        }
        retDef.resolve(retValues);
      }));
      return retDef;
    },

    _createInputNodes: function _createInputNodes() {
      array.forEach(this.config.inputParams, function (param) {
        this._createInputNode(param);
      }, this);
    },

    _clearLastInput: function _clearLastInput() {
      array.forEach(this.inputNodes, function (node) {
        if (node.inputEditor.clear && lang.isFunction(node.inputEditor.clear)) {
          node.inputEditor.clear();
        }
      }, this);
    },

    _clearLastResult: function _clearLastResult() {
      array.forEach(this.resultNodes, function (node) {
        html.destroy(node.labelNode);
        if (node.resultRenderer) {
          node.resultRenderer.destroy();
        }
        html.destroy(node);
      });
      array.forEach(this.resultLayers, function (layer) {
        this.map.removeLayer(layer);
      }, this);

      this.resultNodes = [];
      this.resultLayers = [];
    },

    _createErrorMessages: function _createErrorMessages(messages) {
      this.infoTextNode.innerHTML = '';

      var ulNode = html.create('ul', {
        'class': 'output-node'
      }, this.outputSectionNode);

      this.resultNodes.push(ulNode);

      array.forEach(messages, lang.hitch(this, function (msg) {
        html.create('li', {
          'class': 'error-message',
          innerHTML: utils.sanitizeHTML(msg.description)
        }, ulNode);
      }));
    },

    // ==========================================
    // ImportFile changes
    // ==========================================
    GetRenderer: function GetRenderer(Geometry) {
      console.log("Geometry Type : " + Geometry);
      var pointmarker = new SimpleMarkerSymbol();
      pointmarker.setSize(10);
      pointmarker.setColor(new Color([255, 0, 0, 1]));
      var Point_Renderer = new esri.renderer.SimpleRenderer(pointmarker);

      var linemarker = new SimpleLineSymbol();
      linemarker.setWidth(2);
      linemarker.setColor(new Color([230, 0, 0, 1]));
      var Line_Renderer = new esri.renderer.SimpleRenderer(linemarker);

      var line = new SimpleLineSymbol();
      line.setWidth(1.5);
      line.setColor(new Color([168, 0, 0, 1]));
      var fill = new SimpleFillSymbol();
      fill.setColor(new Color([230, 0, 0, 0.49]));
      fill.setOutline(line);
      var Polygon_Renderer = new esri.renderer.SimpleRenderer(fill);

      if (Geometry === "esriGeometryPolygon") {
        return Polygon_Renderer;
      }

      if (Geometry === "esriGeometryPolyline") {
        return Line_Renderer;
      }

      if (Geometry === "esriGeometryPoint") {
        return Point_Renderer;
      }

      if (Geometry === "esriGeometryMultiPatch") {
        return Polygon_Renderer;
      }
    },

    GeneratePopupTemplate: function GeneratePopupTemplate(InputFeatureSet) {
      var FieldInfos = [];
      var i = 0;
      for (i = 0; i < InputFeatureSet.fields.length; i++) {
        //console.log(InputFeatureSet.fields[i].alias);
        FieldInfos.push({
          fieldName: InputFeatureSet.fields[i].name,
          visible: true,
          label: InputFeatureSet.fields[i].alias
        });
      }

      var popupTemplate = new esri.dijit.PopupTemplate({
        title: InputFeatureSet.displayFieldName,
        fieldInfos: FieldInfos,
        showAttachments: false
      });
      //console.log(popupTemplate);

      return popupTemplate;
    },

    ProcessResults: function ProcessResults(Results) {
      console.log(Results.Name);

      //var GroupLayer = new esri.layers.Layer();
      //GroupLayer.layerId = Results.Name;
      //GroupLayer.id = Results.Name;
      //this.map.addLayer(GroupLayer);
      //console.log("GroupLayerID : "+GroupLayer.id);


      var layers = [];

      console.log("Items found : " + Results.Layers.length);
      var i = 0;
      for (i = 0; i < Results.Layers.length; i++) {
        var FeatureSet = JSON.parse(Results.Layers[i].FeatureSet);
        var NewLayer = this.AddFeatureSetAsLayer(FeatureSet, Results.Name + " - " + Results.Layers[i].Name);
        //layers.push(NewLayer);
      }
      /*
      LayerInfos.getInstance(this.map, this.map.itemInfo)
              .then(lang.hitch(this, function(layerInfos){
                
                
                layerInfos.addFeatureCollection(layers, Results.Name);
              }), lang.hitch(this, function(err){            
                console.error("Can not get LayerInfos instance", err);
              }));
        */
    },

    // Add the feature layer to the map for each bench height
    AddFeatureSetAsLayer: function AddFeatureSetAsLayer(FeatureSet, Name) {

      console.log("Adding Feature set: " + Name);
      console.log("Feature Set : " + FeatureSet);

      var PopupTemplate = this.GeneratePopupTemplate(FeatureSet);

      var layerDefinition = {
        "geometryType": FeatureSet.geometryType,
        "fields": FeatureSet.fields
      };
      //console.log(layerDefinition);

      //benchLayerInfo = this.Get_MinePlan_Bench_LayerDefinition(Name);
      var FeatureSetCollection = {
        layerDefinition: layerDefinition,
        featureSet: FeatureSet
      };

      //var featureSet = new FeatureSet();
      //featureSet.features = FeatureSet.features;

      FeatureLayer = new esri.layers.FeatureLayer(FeatureSetCollection, { mode: esri.layers.FeatureLayer.MODE_ONDEMAND });
      FeatureLayer.layerId = Name;
      FeatureLayer.id = Name;
      FeatureLayer.renderer = this.GetRenderer(FeatureSet.geometryType);
      FeatureLayer.infoTemplate = PopupTemplate;
      //FeatureLayer.parentLayerId = GroupLayer.id;

      //console.log(GroupLayer.id);
      //console.log(GroupLayer.layerId);


      //pause drawing
      //FeatureLayer.suspend();
      //FeatureLayer.infoTemplate = this.SetPopUp();
      //console.log("Adding layer...");
      this.map.addLayer(FeatureLayer);
      return FeatureLayer;
    },
    // =========================================================

    _createOutputNodes: function _createOutputNodes(values) {
      array.forEach(this.config.outputParams, function (param, i) {
        this._createOutputNode(param, values[i]);
      }, this);

      console.log("Parsing results...");
      var allFeatures = [];
      var ImportSuccessful = false;

      array.forEach(values, lang.hitch(this, function (valueObj) {
        console.log(valueObj);
        // *** ImportFile Changes ***
        if (valueObj.paramName === "Message") {
          console.log("Message : " + valueObj.value.Name);
          ImportSuccessful = valueObj.value === "File imported successfully.";
        }
      }));

      console.log("ImportSuccessful" + ImportSuccessful);

      array.forEach(values, lang.hitch(this, function (valueObj) {
        console.log(valueObj);
        // *** ImportFile Changes ***
        if (ImportSuccessful) {
          if (valueObj.paramName === "Output") {
            if (valueObj.dataType === "GPString") {
              console.log(valueObj.value.Name);
              this.ProcessResults(valueObj.value);
            }
          }
        }
        // ***


        if (valueObj.dataType === "GPFeatureRecordSetLayer") {
          var features = valueObj.value && valueObj.value.features;
          if (features && features.length > 0) {
            allFeatures = allFeatures.concat(features);
          }
        }
      }));
      if (allFeatures.length > 0) {
        try {
          var extent = graphicsUtils.graphicsExtent(allFeatures);
          if (extent) {
            this.map.setExtent(extent.expand(1.4));
          }
        } catch (e) {
          console.error(e);
        }
      }
    },

    _onExecuteClick: function _onExecuteClick() {
      if (html.hasClass(this.exeNode, 'jimu-state-disabled')) {
        return;
      }
      this.executeGP();
    },

    _createInputNode: function _createInputNode(param) {
      var node = html.create('div', {
        'class': 'input-node'
      }, this.inputSectionNode);
      var labelNode = html.create('div', {
        'class': 'input-label',
        title: param.tooltip || param.label || ''
      }, node);
      html.create('span', {
        'class': 'label-text',
        innerHTML: utils.sanitizeHTML(param.label)
      }, labelNode);
      if (param.required) {
        html.create('span', {
          'class': 'label-star',
          innerHTML: '*'
        }, labelNode);
      }

      var editorContainerNode = html.create('div', {
        'class': 'editor-container'
      }, node);

      var inputEditor = editorManager.createEditor(param, 'input', 'widget', {
        uid: this.uniqueID,
        config: this.config
      });
      inputEditor.placeAt(editorContainerNode);

      if (inputEditor.editorName === 'SelectFeatureSetFromDraw') {
        this.drawTools.push(inputEditor);
      }

      node.param = param;
      node.inputEditor = inputEditor;
      this.inputNodes.push(node);

      if (param.visible === false) {
        html.setStyle(node, 'display', 'none');
      }
      return node;
    },

    _createOutputNode: function _createOutputNode(param, value) {
      var resultRenderer;
      try {
        resultRenderer = resultRendererManager.createResultRenderer(param, value, {
          uid: this.uniqueID,
          config: this.config
        });
      } catch (err) {
        console.error(err);
        resultRenderer = resultRendererManager.createResultRenderer('error', value, {
          uid: this.uniqueID,
          config: this.config
        });
      }

      if (param.visible) {
        var node = html.create('div', {
          'class': 'output-node'
        }, this.outputSectionNode);

        this.resultNodes.push(node);

        var labelNode = html.create('div', {
          'class': 'output-label',
          title: param.tooltip || param.label || '',
          innerHTML: utils.sanitizeHTML(param.label)
        }, node);

        node.param = param;
        node.labelNode = labelNode;

        var rendererContainerNode = html.create('div', {
          'class': 'renderer-container'
        }, node);

        resultRenderer.placeAt(rendererContainerNode);
        resultRenderer.startup();
        node.resultRenderer = resultRenderer;

        return node;
      } else {
        return null;
      }
    }
  });

  return clazz;
});
