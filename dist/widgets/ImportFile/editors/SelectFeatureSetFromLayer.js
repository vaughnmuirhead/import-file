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

define(['dojo/_base/declare', 'dojo/_base/lang', 'dojo/_base/array', 'dojo/_base/html', 'dojo/on', 'dijit/_TemplatedMixin', 'jimu/dijit/FeaturelayerChooserFromMap', 'jimu/utils', 'esri/tasks/FeatureSet', 'esri/tasks/query', '../BaseEditor', 'dojo/text!./SelectFeatureSetFromLayer.html'], function (declare, lang, array, html, on, _TemplatedMixin, FeaturelayerChooserFromMap, jimuUtils, FeatureSet, Query, BaseEditor, template) {
  //from layers in map
  var clazz = declare([BaseEditor, _TemplatedMixin], {
    templateString: template,
    editorName: 'SelectFeatureSetFromLayer',

    postCreate: function postCreate() {
      this.inherited(arguments);
      this.selectedLayer = null;

      var args = {
        multiple: false,
        createMapResponse: this.map.webMapResponse,
        showLayerFromFeatureSet: true,
        types: this.param.defaultValue && this.param.defaultValue.geometryType ? [jimuUtils.getTypeByGeometryType(this.param.defaultValue.geometryType)] : ['point', 'polyline', 'polygon']
      };
      this.layerChooserFromMap = new FeaturelayerChooserFromMap(args);
      this.layerChooserFromMap.placeAt(this.layerChooseNode);
      this.layerChooserFromMap.startup();

      this.own(on(this.layerChooserFromMap, 'tree-click', lang.hitch(this, this._onTreeClick)));
      html.addClass(this.domNode, 'jimu-gp-editor-sffl');
      html.addClass(this.domNode, 'jimu-gp-editor-base');
    },

    _onDropDownClick: function _onDropDownClick() {
      if (html.getStyle(this.layerChooseNode, 'display') === 'none') {
        this._openLayerChooser();
      } else {
        this._closeLayerChooser();
      }
    },

    _openLayerChooser: function _openLayerChooser() {
      html.setStyle(this.layerChooseNode, 'display', '');
    },

    _closeLayerChooser: function _closeLayerChooser() {
      html.setStyle(this.layerChooseNode, 'display', 'none');
    },

    _onTreeClick: function _onTreeClick() {
      var selected = false;
      array.forEach(this.layerChooserFromMap.getSelectedItems(), function (item) {
        this.layerNameNode.innerHTML = item.layerInfo.title;
        this.selectedLayer = item.layerInfo.layerObject;
        selected = true;
      }, this);
      if (selected) {
        this._closeLayerChooser();
      }
    },

    getValue: function getValue() {
      return this.selectedLayer;
    },

    getGPValue: function getGPValue() {
      var layer = this.selectedLayer;
      if (layer === null) {
        return this.wrapValueToDeferred(null);
      }

      if (layer.url) {
        var query = new Query();
        query.where = '1=1';
        return layer.queryFeatures(query);
      } else {
        var featureset = new FeatureSet();
        featureset.features = layer.graphics;
        return this.wrapValueToDeferred(featureset);
      }
    }
  });

  return clazz;
});
