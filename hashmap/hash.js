
jQuery.loadScript = function (url, callback) {
    jQuery.ajax({
        url: url,
        dataType: 'script',
        success: callback,
        async: true
    });
};

window.HashMapper = function HashMapper(options) {
  this.mode = {};
  this.trail = [];
  this.undone = [];
  this.length = 0;
  this.insertMode = false;
  this.selectors = options.selectors;
  this.currentName = "Shitty";

  this.marker = new google.maps.Marker({
    position: null,
    title: 'Current Leg'
  });

  this.map = new google.maps.Map($(this.selectors.map)[0], {
    center: { lat: 34.738228, lng: -86.601791 },
    zoom: 11,
    mapTypeId: google.maps.MapTypeId.HYBRID,
    mapTypeControl: true,
    mapTypeControlOptions: {
      style: google.maps.MapTypeControlStyle.DROPDOWN_MENU,
      mapTypeIds: ['roadmap', 'terrain', 'satellite', 'hybrid']
    }
  });

  this.directionsService = new google.maps.DirectionsService();

  google.maps.event.addListener(this.map, "rightclick", (event) => {
    this.addSymbol(this.currentSymbol, event.latLng);
  });

  google.maps.event.addListener(this.map, "click", (event) => {
    if (!this.insertMode) return;
    this.addWaypoint(event.latLng);
  }); 

  google.maps.event.addDomListener(document, 'keyup', (event) => {
    var code = (event.keyCode ? event.keyCode : event.which);
    if ($(event.target).is('input'))
      return;

    if (code == 32) {
      this.insertMode = !this.insertMode;
      this.updateCursor();
    }

    if (code == 65) this.setTransit('auto');  
    if (code == 87) this.setTransit('straight');  
    if (code == 85) this.undo();
    if (code == 82) this.redo();
    if (code == 73) this.updateSymbol(prompt("Chalk Talk Symbol")); 
    if (code == 78) this.updateName(prompt("Trail Name")); 
    if (code == 27) this.closeHelp(), this.updateSymbol(null); 
    if (code == 191) this.showHelp();
    if (code == 83) this.generateSave();
  });

  this.loadJson = function loadJson(geoString) {
    var json = JSON.parse(geoString);
    this.updateName(json.name);
    for (var idx in json.trail) {
      var itm = json.trail[idx]; 
      if (itm.label)
        this.addSymbol(itm.label, itm.pos);
      else {
        this.setTransit(itm.mode);
        this.addPathLeg(itm.pos);
      } 
    }
    this.updateLastLeg();
    this.map.panTo(this.lastLeg);
  }

  var contain = $(this.selectors.searchContainer)[0];
  var input = $(this.selectors.search)[0];
  var searchBox = new google.maps.places.SearchBox(input);
  this.map.controls[google.maps.ControlPosition.TOP_LEFT].push(contain);

  var autocomplete = new google.maps.places.Autocomplete(input);

  // Bind the map's bounds (viewport) property to the autocomplete object,
  // so that the autocomplete requests use the current map bounds for the
  // bounds option in the request.
  autocomplete.bindTo('bounds', this.map);

  autocomplete.addListener('place_changed', () => {
    var place = autocomplete.getPlace();
    if (!place.geometry) return;
    this.map.panTo(place.geometry.location);
    this.map.setZoom(17);
  });


  this.pathLength = function pathLength() {
    var length = 0;
    for ( var t in this.trail ) {
      var tr = this.trail[t];
      if (tr.text) continue;

      var legLen = google.maps.geometry.spherical.computeLength(tr.getPath().getArray());
      length += legLen;
    }

    length *= 0.000621371;
    length = length.toPrecision(3);
    return (this.length = length);
  };

  this.setTransit = function setTransit(tp) {
    this.mode.id = tp;
    if (tp == 'auto') {
      console.log("Setting 'Auto'");
      $('#ddControl').addClass("autoLeg").removeClass("straightLeg");
      this.mode.type = google.maps.TravelMode.DRIVING;
      this.mode.color = '#00FF00';
    } 
    if (tp == 'straight') {
      console.log("Setting 'Straight'");
      $('#ddControl').removeClass("autoLeg").addClass("straightLeg");
      this.mode.type = google.maps.TravelMode.WALKING;
      this.mode.color = '#FF0000';
    }
  };

  this.updateLastLeg = function updateLastLeg() {
    if (this.trail.length == 0) {
      this.marker.setMap(null);
      return;
    }

    var itm;
    for (var t in this.trail) {
      itm = this.trail[this.trail.length - 1 - t];
      if (itm.text)
        continue;
      break;
    }

    if (itm.text) {
      this.marker.setMap(null);
      return;
    }

    arr = itm.getPath().getArray();
    this.setLastLeg(arr[arr.length - 1]);
  };

  this.undo = function undo() {
    if (this.trail.length == 0) return;

    var undo_leg = this.trail.pop();
    this.undone.push(undo_leg);
    undo_leg.setMap(null);
    this.updateLastLeg();
  };

  this.redo = function redo() {
    if (this.undone.length == 0) return;

    var undo_leg = this.undone.pop();
    this.trail.push(undo_leg);
    undo_leg.setMap(this.map);
    this.updateLastLeg();
  };

  this.center = function center() {
    if (this.lastLeg)
      this.map.panTo(this.lastLeg);
  };

  this.addPathLeg = function addPathLeg(path) {
    var leg = new google.maps.Polyline({
      path: path,
      geodesic: true,
      strokeColor: this.mode.color,
      strokeOpacity: 1.0,
      strokeWeight: 2,
      mode: this.mode.id
    });

    leg.setMap(this.map);
    this.trail.push(leg);
    this.updateDistance(this.pathLength());
  };

  this.setLastLeg = function setLastLeg(leg) {
    this.marker.setPosition(leg);
    this.marker.setMap(this.map);
    this.lastLeg = leg;

    this.updateDistance(this.pathLength());
  }

  this.addWaypoint = function addWaypoint(next, cb) {
    undone = [];
    var start = this.lastLeg;
    this.setLastLeg(next);
    if (!start) {
      if (cb) cb();
      return;
    }

    if ( this.mode.id == 'auto') {
      var request = {
        origin: start,
        destination: this.lastLeg,
        travelMode: this.mode.type 
      };

      this.directionsService.route(request, (response, status) => {
        if (status == google.maps.DirectionsStatus.OK) {
          var dpath = response.routes[0].overview_path;
          dpath.push(next);
          this.addPathLeg(dpath);
        } else {
          alert("Couldn't fetch driving direction from the selected point. " +
                "Generating Maximum Shiggy!");

          var oldmode = this.mode.id;
          this.setTransit('straight');
          this.addPathLeg([start, this.lastLeg]);
          this.setTransit(oldmode);
        }

        if (cb) cb();
      });
    } else {
      this.addPathLeg([start, this.lastLeg]);
      if (cb) cb(); 
    }
  }

  this.updateDistance = function updateDistance(dist) {
    $(this.selectors.distance).html(String(dist) + " miles");
  }

  this.showHelp = function showHelp() {
    $(this.selectors.help).show();
  }

  this.closeHelp = function closeHelp() {
    $(this.selectors.help).hide();
  }

  this.updateCursor = function updateCursor() {
    if (this.insertMode)
      this.map.setOptions({ draggableCursor: 'crosshair' });
    else
      this.map.setOptions({ draggableCursor: 'pan' });
  }

  this.updateSymbol = function updateSymbol(symbol) {
    this.currentSymbol = symbol;
    $(this.selectors.symbol).html(symbol || "[none]");
  }

  this.updateName = function updateName(name) {
    if (!name) return;
    this.currentName = name;
    $(this.selectors.name).html(name);
  }

  this.addSymbol = function addSymbol(lbl, pos) {
    if (!this.currentSymbol) return;
    var label = new MapLabel({
       text: lbl,
       position: pos, 
       map: this.map,
       fontSize: 20,
       align: 'right'
     });
    this.trail.push(label);
  }

  this.download = function download(filename, text) {
    var element = document.createElement('a');
    element.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(text));
    element.setAttribute('download', filename);

    element.style.display = 'none';
    document.body.appendChild(element);

    element.click();

    document.body.removeChild(element);
  }

  function llobj(pos) {
    return { lat: pos.lat(), lng: pos.lng() };
  }

  this.generateSave = function generateSave() {
    var save = [];
    for ( var t in this.trail ) {
      var trail = this.trail[t];

      if (trail.text) {
        save.push({ label: trail.text, pos: llobj(trail.position) });
        continue;
      }
      var pathArr = trail.getPath().getArray();

      var path = [];
      for ( var p in pathArr ) {
        path.push(llobj(pathArr[p]));
      }
    
      save.push({ pos: path, mode: this.trail[t].mode });
    }

    this.download(this.currentName + '.trail',
                  JSON.stringify({ name: this.currentName, trail: save }));
  }

  var dropContainer = $(this.selectors.dropContainer);

  function showPanel(e) {
    e.stopPropagation();
    e.preventDefault();
    dropContainer.show();
    return false;
  }

  function hidePanel(e) {
    dropContainer.hide();
  }

  this.handleDrop = function handleDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    hidePanel(e);

    if (this.trail.length > 0) {
      if (confirm("You already have a trail loaded. Do you want to save it?")) {
        this.generateSave();
      }
      this.trail = [];
    }

    var files = e.dataTransfer.files;
    if (files.length) {
      // process file(s) being dropped
      // grab the file data from each file
      for (var i = 0, file; file = files[i]; i++) {
        var reader = new FileReader();
        reader.onload = (e) => {
          this.loadJson(e.target.result);
        };
        reader.onerror = function(e) {
          console.error('reading failed');
        };
        reader.readAsText(file);
      }
    } else {
      // process non-file (e.g. text or html) content being dropped
      // grab the plain text version of the data
      var plainText = e.dataTransfer.getData('text/plain');
      if (plainText) {
        loadJson(plainText);
      }
    }

    return false;
  }

  // map-specific events
  $(this.selectors.map)[0].addEventListener('dragenter', showPanel, false);

  // overlay specific events (since it only appears once drag starts)
  dropContainer[0].addEventListener('dragover', showPanel, false);
  dropContainer[0].addEventListener('drop', (e) => { return this.handleDrop(e); }, false);
  dropContainer[0].addEventListener('dragleave', hidePanel, false);

  this.setTransit('straight');
}

