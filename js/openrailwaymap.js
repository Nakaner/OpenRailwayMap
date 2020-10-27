/*
OpenRailwayMap Copyright (C) 2012 Alexander Matheisen
This program comes with ABSOLUTELY NO WARRANTY.
This is free software, and you are welcome to redistribute it under certain conditions.
See http://wiki.openstreetmap.org/wiki/OpenRailwayMap for details.
*/


OpenRailwayMap = function(config)
{
	var self = this;

	this.urlParams = {};
	window.location.hash.replace(new RegExp("([^#=&]+)(=([^&]*))?", "g"), function($0, $1, $2, $3) {self.urlParams[$1] = $3;});

	this.appName = config['appName'];
	this.mapContainerId = config['mapContainerId'];
	this.lat = this.urlParams['lat'] || config['lat'];
	this.lon = this.urlParams['lon'] || config['lon'];
	this.zoom = this.urlParams['zoom'] || config['zoom'];
	this.tileUrl = config['tileUrl'];
	this.apiUrl = config['apiUrl'];
	this.availableStyles = config['availableStyles'];
	this.legendsByStyle = {}

	// translate website to user language
	this.availableTranslations = config['availableTranslations'];
	this.lang = null;
	this.language = null;
	this.lang = this.getUserLang();

};


OpenRailwayMap.prototype =
{
	init: async function()
	{
		var self = this;
		var response = null;
		await fetch('locales/'+this.lang+'.json')
			.then(response => response.json())
			.then(function(data) {
				self.translate(self, data);
			});
		translations = self.language.translations;
		// language selector
		$('ul.langSelection').on('click', 'a', function()
		{
			self.lang = $(this).data('lang');
			fetch('locales/'+this.lang+'.json')
				.then(r => r.json)
				.then(function(data) {
					self.translate(self, data);
				});
		});

		this.map = new L.Map(this.mapContainerId);

		// loading timestamp
		//var timestamp = new Timestamp("info");
		// create search
		//search = new Search(map, "searchBox", "searchBar", "searchButton", "clearButton");

		this.railmap = new L.TileLayer(this.tileUrl+this.availableStyles[0]+'/{z}/{x}/{y}.png',
		{
			attribution: translations['railmapAttribution'],
			minZoom: 2,
			maxZoom: 19,
			tileSize: 256
		}).addTo(this.map);

		// grayscale mapnik background layer
		this.mapnikGray = new L.TileLayer.Grayscale('http://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
		{
			attribution: translations['mapnikAttribution'],
			maxZoom: 19,
			code: 'mapnikgray'
		});

		// normal mapnik background layer
		this.mapnik = new L.TileLayer('http://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
		{
			attribution: translations['mapnikAttribution'],
			maxZoom: 19,
			code: 'mapnik'
		});

		// blank background map
		this.blank = new L.TileLayer(window.location.origin + window.location.pathname +'/img/blank.png',
		{
			maxZoom: 20,
			code: 'blank'
		});

		this.hillshading = new L.TileLayer('http://{s}.tiles.wmflabs.org/hillshading/{z}/{x}/{y}.png',
		{
			attribution: translations['hillshadingAttribution'],
			maxZoom: 17
		});

		this.baseLayers = {};
		this.baseLayers[translations['mapnik']] = this.mapnik;
		this.baseLayers[translations['mapnikGrayscale']] = this.mapnikGray;
		this.baseLayers[translations['blank']] = this.blank;

		this.overlays = {};
		this.overlays[translations['hillshading']] = this.hillshading;
		this.overlays[translations['railmap']] = this.railmap;

		var scaleLine = new L.Control.Scale({metric: true, maxWidth: 200}).addTo(this.map);
		var layerSwitch = new L.Control.Layers(this.baseLayers, this.overlays);
		this.map.addControl(layerSwitch);

		// set initial map state from permalink
		this.map.setView(new L.LatLng(this.lat, this.lon), this.zoom);
		// set position by geolocation API if available
		this.map.locate({timeout: 3000, enableHighAccuracy: true, setView: true, watch: false});
		this.setStyle(this.urlParams['style'] || this.availableStyles[0]);
		for (var layername in this.baseLayers)
			if (this.baseLayers[layername].options.code == this.urlParams['layers'])
				this.baseLayers[layername].addTo(this.map);

		// if layername in permalink was invalid
		for (var i in this.map._layers)
		{
			var layer = this.map._layers[i];
			if (layer.options && layer.options.code)
				var selectedBackgroundLayer = layer.options.code;
		}
		if (selectedBackgroundLayer == null)
			this.baseLayers[translations['mapnikGrayscale']].addTo(this.map);

		history.pushState(null, this.appName, this.getUrl());

		this.map.on('zoomend', function(e)
		{
			self.updateLegend(self.railmap.selectedStyle);
			//railmap.redraw();
		});

		// TODO layeradd layerremove baselayerchange overlayadd overlayremove
		this.map.on('moveend', function(e)
		{
			self.updatePermalink();
		});

		$('#searchFacilityButton').on('click', function()
		{
			// TODO validate params

			var params = {};

			if ($('#facilityNameInput').val().length > 0)
				params['name'] = $('#facilityNameInput').val();
			else if ($('#facilityRefInput').val().length > 0)
				params['ref'] = $('#facilityRefInput').val();
			else if ($('#facilityUICrefInput').val().length > 0)
				params['uicref'] = $('#facilityUICrefInput').val();

			if ($('#facilityOperatorInput').val().length > 0)
				params['operator'] = $('#facilityOperatorInput').val();

			$.ajax(
			{
				context: this,
				dataType: 'json',
				data: params, 
				url: self.apiUrl+'facility',
				type: 'GET'
			})
			.done(function(data)
			{
				for (var charge in data)
				{
					console.log(data[charge]);
				}
			})
			.fail(function(jqXHR, status)
			{
				// TODO Laden fehlgeschlagen
			});
		});

		$('#searchMilestoneButton').on('click', function()
		{
			// TODO validate params

			var params = {};

			if ($('#milestoneRefInput').val().length > 0)
				params['ref'] = $('#milestoneRefInput').val();
			if ($('#milestonePositionInput').val().length > 0)
				params['position'] = $('#milestonePositionInput').val();
			if ($('#milestoneOperatorInput').val().length > 0)
				params['operator'] = $('#milestoneOperatorInput').val();

			$.ajax(
			{
				context: this,
				dataType: 'json',
				data: params, 
				url: self.apiUrl+'milestone',
				type: 'GET'
			})
			.done(function(data)
			{
				for (var charge in data)
				{
					console.log(data[charge]);
				}
			})
			.fail(function(jqXHR, status)
			{
				// TODO Laden fehlgeschlagen
			});
		});
	},

	setStyle: function(style)
	{
		$('.styleSelector').each(function(index, element)
		{
			if ($(this).data('id') == style)
				$($(this).children()[1]).addClass('uk-icon-check');
			else
				$($(this).children()[1]).removeClass('uk-icon-check');
		});

		// helper variable for saving current map style
		this.railmap.selectedStyle = style;
		// change tileserver url to load different style
		this.railmap._url = this.tileUrl+style+'/{z}/{x}/{y}.png';
		// reload all tiles after style was changed
		this.railmap.redraw();

		this.updateLegend(style);
		this.updatePermalink();
	},

	getUrl: function(marker)
	{
		var center = this.map.getCenter();
		var zoom = this.map.getZoom();
		var style = this.railmap.selectedStyle;

		for (var i in this.map._layers)
		{
			var layer = this.map._layers[i];
			if (layer.options && layer.options.code)
				var layerName = layer.options.code;
		}

		center = center.wrap();

		var precision = Math.max(0, Math.ceil(Math.log(zoom) / Math.LN2));

		// TODO save osmid, osmtype, searchquery, ref, name, position, line
		var baseUrl = window.location.origin + window.location.pathname;
		return baseUrl+'#zoom='+zoom+'&lat='+center.lat.toFixed(precision)+'&lon='+center.lng.toFixed(precision)+'&layers='+layerName+'&style='+style;
	},

	updatePermalink: function()
	{
		history.replaceState(null, this.appName, this.getUrl());
	},

	translate: function(self, data)
	{
		var baseurl = window.location.origin + window.location.pathname.replace('index.html', '');
		self.language = data;
		self.replaceStringsByTranslations();

		$('ul.langSelection a i').removeClass('uk-icon-check');
		$('ul.langSelection a').each(function(index, element)
		{
			if ($(this).data('lang') == self.lang)
				$($(this).children()[0]).addClass('uk-icon-check');
				return;
		});
	},

	replaceStringsByTranslations: function()
	{
		var stringsToTranslate = $("[data-i18n]");

		for (var i=0; i<stringsToTranslate.length; i++)
		{
			var originalText = $(stringsToTranslate[i]).data('i18n');
			var translatedText = this.translateString(originalText);
			stringsToTranslate[i].innerHTML = translatedText;
		}
	},

	translateString: function(text, n)
	{
		var translation = this.language.translations[text];

		if (!n && typeof translation == 'object')
			return translation[0];

		if (n && typeof translation == 'object')
		{
			var plural = eval(this.language.plural.replace('n', n));
			// avoid array index overflow
			plural = Math.min(plural, this.language.nplurals);
			return translation[plural].replace('%d', n);
		}

		if (typeof translation != 'undefined' && translation.length > 0)
			return translation;

		return text;
	},

	getUserLang: function()
	{
		var lang = navigator.language || navigator.userLanguage || 'en-GB';
		var languages = navigator.languages || [lang];

		for (var i=0; i<navigator.languages.length; i++)
		{
			// lang-country combination as first choice
			var langcountrycode = navigator.languages[i].replace('-', '_');
			for (var key in this.availableTranslations)
				if (this.availableTranslations.hasOwnProperty(key) && this.availableTranslations[key] === langcountrycode)
					return langcountrycode;

			// only lang as second choice
			var langcode = langcountrycode.split('_')[0];
			if (this.availableTranslations.hasOwnProperty(langcode))
				return this.availableTranslations[langcode];
		}

		return 'en_GB';
	},

	renderLegend: function(self, legendData, imagePath)
	{
		var legendTable = document.querySelector('#legend table');
		if (legendTable) {
			var children = legendTable.children;
			for (var i = 0; i < children.length; ++i) {
				children[i].parentNode.removeChild(children[i]);
			};
		}
                document.querySelector('#legendErrorMsg').classList.add('legendErrorMsgVisible');
                document.querySelector('#legendErrorMsg').classList.remove('legendErrorMsg');
		var legendThisZoom = legendData.filter(entry => entry.zoom == this.map.getZoom());
		// if no features are rendered in this zoom level, show message
		if (legendData.length == 0)
		{
			var errorMsgP = document.querySelector('#legendErrorMsg');
			errorMsgP.classList.add('legendErrorMsgVisible');
			errorMsgP.textContent = self.translateString('Nothing to see in this zoom level. Please zoom in.');
			return;
		}
		// Get groups of legend items
		var legendGroups = [];
		legendThisZoom.forEach(function(e) {
			if (!legendGroups.includes(e.properties.group)) {
				legendGroups.push(e.properties.group);
			}
		});
		legendGroups.forEach(function(group) {
			var legendItems = legendThisZoom.filter(e => e.properties.group == group);
			var template = document.querySelector('#legend-template');
			legendItems.forEach(function(e) {
				var clone = template.content.cloneNode(true).querySelector('.legend-row');
				clone.querySelector('.legend-icon-cell img').src = imagePath + e.image;
				clone.querySelector('.legend-text-cell').textContent = self.translateString(e.description);
				legendTable.appendChild(clone);
			});
		});
	},

	// reload the legend after changing zoomlevel or stylesheet
	updateLegend: function(style)
	{
		var legendPath = 'build/map-key/';
		var self = this;
		var legendThis = this.legendsByStyle[style] || null;
		if (legendThis != null) {
			self.renderLegend(self, legendThis, legendPath);
			return;
		}

		var baseurl = window.location.origin + window.location.pathname.replace('index.html', '');
		$.getJSON(baseurl + legendPath + style + '.json')
		.done(function(data)
		{
			self.legendsByStyle[style] = data;
			self.renderLegend(self, data, legendPath);
		})
		.fail(function(jqXHR, status)
		{
			var errorMsgP = document.querySelector('#legendErrorMsg');
			errorMsgP.classList.add('legendErrorMsgVisible');
			errorMsgP.textContent = self.translateString('Legend not available for this style.');
		});
	}
};
