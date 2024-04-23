import * as THREE from 'three';
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader";
import { ThreeJSOverlayView } from "@googlemaps/three";
import gsap from 'gsap';

const NEW_YORK_BOUNDS = {
  north: 41.04,
  south: 40.38,
  west: -74.37,
  east: -73.58
};
const CENTER = { lat: 40.71, lng: -73.97 };

// general map stuff
let map;
let mapOptions; // map settings
let infoWindow;
let chosenCoords;
let bounds;
let database; // firebase database
let currLoc;
let currLocMarker;
let previewMarker;
let streetMode;
let markers2D = [];
let markers3D = [];

// threejs
let scene;
let overlay;
let ambientLight;
let directionalLight;
let loader;
let pointer;
let raycaster;
let renderer;
let camera;

document.addEventListener('DOMContentLoaded', () => {
  initMap();
});

function initMap() {
    // set options
    mapOptions = {
      center: CENTER,
      zoom: 10,
      tilt: 0,
      mapId: '91730daa8c535619',
      // disable controls code from https://stackoverflow.com/questions/5976854/how-to-disable-google-maps-satellite-view
      mapTypeControlOptions: {
        mapTypeIds: [google.maps.MapTypeId.ROADMAP, google.maps.MapTypeId.HYBRID]
      }, // here´s the array of controls
      disableDefaultUI: true, // a way to quickly hide all controls
      // restrict it to NYC
      restriction: {
        latLngBounds: NEW_YORK_BOUNDS,
        strictBounds: false
      },
    };

    // create map, initialize properties
    map = new google.maps.Map(document.getElementById("map"), mapOptions);

    // create info window to display story text
    infoWindow = new google.maps.InfoWindow();
 
    // create bounds
    bounds = new google.maps.LatLngBounds();

    // add geoJson to the data-layer
    map.data.loadGeoJson('/boundaries.geojson');

    streetMode = false;

    // initialize previewMarker with image, don't show it yet
    previewMarker = new google.maps.Marker({
      position: null,
      map: null,
      icon: {
        scaledSize: new google.maps.Size(30, 30),
        url: "/transparent_circle.png",
        anchor: new google.maps.Point(15, 15),
      }
    });

    // initialize currLocMarker with image, don't show it yet
    currLocMarker = new google.maps.Marker({
      position: null,
      map: null,
      icon: {
        scaledSize: new google.maps.Size(30, 30),
        url: "/blue_dot.png"
      }
    });

    // define bounds of each borough according to json file

    // UNCOMMENT THE BELOW 2 BLOCKS ONCE I FIGURE OUT JSON
    // brian's code
    map.data.addListener('addfeature', function (event) {
      // console.log('working', event.feature.getGeometry())
      bounds = new google.maps.LatLngBounds()
      infoWindow = new google.maps.InfoWindow()
      const geometry = event.feature.getGeometry()
      processPoints(geometry, bounds.extend, bounds)
      map.fitBounds(bounds)
    });

    // Set mouseover event for each feature.
    map.data.addListener('mouseover', function(event) {
      if (!chosenCoords) {
        document.getElementById('invalid-loc').textContent =
        "click to drop a pin here!";
      }
    });
    map.data.addListener('mouseout', function(event) {
      if (!chosenCoords) {
        document.getElementById('invalid-loc').textContent =
        "oops, this isn't nyc anymore...";
      }
    });

    // tint NYC area a bit
    map.data.setStyle({
      fillColor: "#a8c1ff",
      fillOpacity: 0.1,
      strokeColor: "#4D62CB", 
      strokeWeight: 1,
    });

    map.fitBounds(bounds);

    // set up firebase
    config();
    database = firebase.database();

    // addThreeJS();
    // scene = new THREE.Scene()
    // ambientLight = new THREE.AmbientLight(0xffffff, 0.75)
    // scene.add(ambientLight)
    // directionalLight = new THREE.DirectionalLight(0xffffff, 0.25)
    // directionalLight.position.set(0, 10, 50)
    // scene.add(directionalLight)
    // loader = new GLTFLoader();

    // set up threejs stuff
    initThreeJS();
    // allow app to detect user location
    initGeolocation();
    // allow user to search for a place
    initLocationSearch();
    // allow map to detect clicks
    initClickListener();
    // set up popup panel for submitting a new memory
    initPopup();
    // set up correct actions for submitting a new memory
    initForm();
    // set up street mode option
    initStreetMode();
    // populate map
    populateMap2D(); // load all 2D markers
    populateMap3D(scene); // load all 3D markers
    hideMarkers3D(); // hide 3D scene initially
    raycast(); // init click listener for 3D markers
}

function initThreeJS() {
  scene = new THREE.Scene()
  ambientLight = new THREE.AmbientLight(0xff82e0, 0.75)
  scene.add(ambientLight)
  directionalLight = new THREE.DirectionalLight(0xffffff, 0.25)
  directionalLight.position.set(0, 10, 50)
  // scene.add(directionalLight)
  loader = new GLTFLoader();

  pointer = new THREE.Vector2();
  raycaster = new THREE.Raycaster();
  renderer = new THREE.WebGLRenderer({ antialias: true })
  camera = new THREE.PerspectiveCamera(
    75,
    window.innerWidth / window.innerHeight,
    0.1,
    100
  );
  camera.position.set(0, 0, 5);
}

// populate map with 2D markers for existing entries in database
function populateMap2D() {
    database.ref("memories").once('value', (snapshot) => {
      snapshot.forEach((childSnapshot) => {
        // var childKey = childSnapshot.key;
        var childData = childSnapshot.val();

        // create a marker
        const marker = new google.maps.Marker({
            map: map,
            position: childData.coords
        });

        var content = childData.locationText + ":\n" + childData.memoryText;
        marker.addListener('click', function() {
            infoWindow.setContent(content);
            infoWindow.open(map, marker);
        });

        markers2D.push(marker);
      });
    });
}

// from https://developers.google.com/maps/documentation/javascript/examples/marker-remove#maps_marker_remove-javascript
// Sets the map on all markers in the array.
function setMapOnAll(map) {
  for (let i = 0; i < markers2D.length; i++) {
    markers2D[i].setMap(map);
  }
}

// Removes the markers from the map, but keeps them in the array.
function hideMarkers2D() {
  setMapOnAll(null);
}

// Shows any markers currently in the array.
function showMarkers2D() {
  setMapOnAll(map);
}

// populate map with 3D markers
function populateMap3D(scene) {
  overlay = new ThreeJSOverlayView({
    map,
    scene,
    THREE,
  });

  let initialLoadComplete = false;

  database.ref('memories').once('value', (snapshot) => {
    snapshot.forEach((childSnapshot) => {
      const childData = childSnapshot.val();
      const position = childData.coords;
      const markerId = childSnapshot.key;

      loader.load("../daffodil.glb", (gltf) => {
        const model = gltf.scene;
        model.name = 'daffodil';
        model.rotation.x = Math.PI / 2;
        model.rotation.y = Math.random() * 2 * Math.PI;
        model.scale.set(30, 30, 30);

        // custom property to store extra data
        model.userData = {
          locationText: childData.locationText,
          memoryText: childData.memoryText
        };

        // convert marker position to vector3
        const markerPosition = overlay.latLngAltitudeToVector3({
          ...position,
          altitude: 0,
        });

        model.position.copy(markerPosition);
        scene.add(model);

        // store the loaded model in the markers array
        markers3D.push({ id: markerId, model });
      });
    });
    initialLoadComplete = true;
    console.log("markers3D: ", markers3D);
  });
  
  // listen for changes in the 'memories' database node after initial load
  database.ref('memories').on('child_added', (snapshot) => {
    if (initialLoadComplete) {
      const childData = snapshot.val();
      const position = snapshot.val().coords;
      const markerId = snapshot.key;

      // load the 3D model for the new marker
      // loader.load("../daffodil/scene.gltf", (gltf) => {
      loader.load("../daffodil.glb", (gltf) => {
        const model = gltf.scene;
        model.name = 'daffodil';
        model.rotation.x = Math.PI / 2;
        model.scale.set(30, 30, 30);

        // custom property to store extra data
        model.userData = {
          locationText: childData.locationText,
          memoryText: childData.memoryText
        };

        model.position.copy(
          overlay.latLngAltitudeToVector3({
            ...position,
            altitude: 0,
          })
        );
        scene.add(model);
        console.log("scene.children after adding: ", scene.children);

        // store the loaded model in the markers array
        markers3D.push({ id: markerId, model });
      });
    }
  });
  
}

// function to access a specific marker by its id
function getMarkerById(id) {
  return markers3D.find(marker => marker.id === id);
}

function hideMarkers3D() {
  console.log('hide 3D markers');
  scene.visible = false;
  overlay.requestRedraw();
  // console.log(scene);
}

function showMarkers3D() {
  console.log('show 3D markers');
  scene.visible = true;
  overlay.requestRedraw();
  // console.log(scene);
}

function config() {
  const firebaseConfig = {
		apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
		authDomain: import.meta.env.VITE_AUTH_DOMAIN,
		databaseURL: 'https://kelly-capstone-default-rtdb.firebaseio.com',
		projectId: 'kelly-capstone',
		storageBucket: 'kelly-capstone.appspot.com',
		messagingSenderId: import.meta.env.VITE_MESSAGE_ID,
		appId: import.meta.env.VITE_APP_ID,
		measurementId: import.meta.env.VITE_MEASUREMENT_ID,
	};
	firebase.initializeApp(firebaseConfig);
}

/**
 * Process each point in a Geometry, regardless of how deep the points may lie.
 * from https://developers.google.com/maps/documentation/javascript/examples/layer-data-dragndrop
 */
function processPoints(geometry, callback, thisArg) {
  if (geometry instanceof google.maps.LatLng) {
    callback.call(thisArg, geometry);
  } else if (geometry instanceof google.maps.Data.Point) {
    callback.call(thisArg, geometry.get());
  } else {
    // @ts-ignore
    geometry.getArray().forEach((g) => {
      processPoints(g, callback, thisArg);
    });
  }
}

// revise this soon so that it gets their location on page load and continuously updates it whenever it changes
// from https://developers.google.com/maps/documentation/javascript/geolocation#maps_map_geolocation-javascript
function initGeolocation() {
    const locationButton = document.getElementById("currentloc-button");
    map.controls[google.maps.ControlPosition.TOP_RIGHT].push(locationButton);
    locationButton.addEventListener("click", locateUser);
    locateUser();
}

function locateUser() {
  infoWindow = new google.maps.InfoWindow();
  // Try HTML5 geolocation.
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
        (position) => {
          const pos = {
              lat: position.coords.latitude,
              lng: position.coords.longitude,
          };
          // update location of currLocMarker, show on map
          currLocMarker.setMap(map);
          currLocMarker.setPosition(pos);
          currLoc = pos;
        }, () => {
        handleLocationError(true, infoWindow, map.getCenter());
        },
    );
    } else {
      // Browser doesn't support Geolocation
      handleLocationError(false, infoWindow, map.getCenter());
    }
    zoomIn(currLoc);

}

function handleLocationError(browserHasGeolocation, infoWindow, pos) {
    infoWindow.setPosition(pos);
    infoWindow.setContent(
      browserHasGeolocation
        ? "Error: The Geolocation service failed."
        : "Error: Your browser doesn't support geolocation.",
    );
    infoWindow.open(map);
}

// from https://developers.google.com/maps/documentation/javascript/examples/places-searchbox
// https://stackoverflow.com/questions/29869261/google-map-search-box
function initLocationSearch() {
    // Create the search box and link it to the UI element.
    const input = document.getElementById("search-input");
    const searchBox = new google.maps.places.SearchBox(input);

    map.controls[google.maps.ControlPosition.TOP_LEFT].push(document.getElementById('search-input'));
    map.addListener("bounds_changed", () => {
      searchBox.setBounds(map.getBounds());
    });
    searchBox.addListener('places_changed', () => {
      searchBox.set('map', null);
 
 
      var places = searchBox.getPlaces();
 
      // For each place, get the icon, name and location.
      var bounds = new google.maps.LatLngBounds();
      var i, place;
      for (i = 0; place = places[i]; i++) {
        (function(place) {
          // display previewMarker at the chosen search result
          previewMarker.setPosition(place.geometry.location);
          previewMarker.setMap(map);

          previewMarker.bindTo('map', searchBox, 'map');
          google.maps.event.addListener(previewMarker, 'map_changed', function() {
            if (!this.getMap()) {
              this.unbindAll();
            }
          });
          bounds.extend(place.geometry.location);
          chosenCoords = place.geometry.location;
          
          // update location status
          updateLocationStatus("Location Status: Searched up " + chosenCoords);
          document.getElementById('invalid-loc').textContent = "fill out memory details ☆";
          document.getElementById("search-input").value = "";
 
        } (place));
 
      }
      map.fitBounds(bounds);
      searchBox.set('map', map);
      zoomIn(chosenCoords);
    });
}

// click listener for whenever user clicks within the borough boundaries of NYC
function initClickListener(){
  map.data.addListener("click", function(mapsMouseEvent) {
    chosenCoords = mapsMouseEvent.latLng;
    // update location status
    updateLocationStatus("Location Status: Clicked on " + chosenCoords);
    document.getElementById('invalid-loc').textContent = "fill out memory details ☆";
    // display preview marker
    previewMarker.setPosition(chosenCoords);
    previewMarker.setMap(map);
    infoWindow.close();
  });

  // click outside of the NYC area (map.data is the nyc data layer)
  map.addListener("click", function(mapsMouseEvent) {
    chosenCoords = null;
    // update location status
    updateLocationStatus("Location Status: Not a valid location");
    document.getElementById('invalid-loc').textContent = "oops, this isn't nyc anymore...";
    // display preview marker
    previewMarker.setPosition(null);
    previewMarker.setMap(null);
    infoWindow.close();
  });
}

// add click listener for 3D models
function raycast() {
	window.addEventListener('click', (event) => {
    if (streetMode) {
      pointer.x = (event.clientX / window.innerWidth * 0.7) * 2 - 1;
      pointer.y = -(event.clientY / window.innerHeight * 0.7) * 2 + 1; // y starts out as negative
      raycaster.setFromCamera(pointer, camera);
      const intersects = raycaster.intersectObjects(scene.children, true);
      // console.log(window.innerWidth);
      console.log(intersects);
  
      // loop through all intersected objects, trigger other events based on what user clicked on
      for (let i = 0; i < intersects.length; i++) {
        let object = intersects[i].object;
        while (object) {
          if (object.userData.groupName === 'daffodil') {
            // gsap.to(meshes.default.scale, {
            // 	x: 5,
            // 	y: 5,
            // 	z: 5,
            // 	duration: 1
            // });
            break;
          }
          object = object.parent;
        }
      }
    }
	});
}

function initPopup() {
  document.querySelector(".side-panel-toggle").addEventListener("click", () => {
    document.querySelector(".wrapper").classList.toggle("side-panel-open");
  });
}

// add event listener to form for adding memories to database
function initForm() {
  // Add event listener to the form
  document.getElementById("marker-form").addEventListener("submit", function(event) {
    event.preventDefault(); // Prevent default form submission
    // Check if the input field has text entered
    const locationText = document.getElementById("location-text").value.trim();
    const memoryText = document.getElementById("memory-text").value.trim();
    if (locationText && memoryText && chosenCoords) {
        // hide previewMarker
        previewMarker.setPosition(null);
        previewMarker.setMap(null);
        // add a marker
        addMarker(chosenCoords, locationText, memoryText);
        // save to firebase
        saveMarkerToFirebase(chosenCoords, locationText, memoryText);
        // clear chosenCoords and text
        clearUserInput();
    } else {
        alert("Please enter both text and a location for the marker."); // Show an alert if no text is entered
    }
  });
}

// adds a new marker with given coords, locationText, memoryText
function addMarker(coords, locationText, memoryText) {
  // check that we are able to add marker
  if (coords && locationText && memoryText) {
    // create marker
    const marker = new google.maps.Marker({
      position: coords,
      map: map,
    });

    let content = locationText + ": " + memoryText;
    marker['text'] = content;

    // open up the infoWindow
    infoWindow.setContent(content);
    infoWindow.open(map, marker);

    // add click listener to marker
    marker.addListener('click', function() {
      infoWindow.setContent(content);
      infoWindow.open(map, marker);
      console.log('marker clicked');
    });

    updateMarkerStatus("Marker Status: Marker added at " + marker.position);
  }
}

// save marker to firebase using given coords, locationText, memoryText
function saveMarkerToFirebase(coords, locationText, memoryText) {
  const lat = coords.lat();
  const lng = coords.lng();
  
  // save to database
  database.ref("memories").push({
      coords: {
        lat: lat,
        lng: lng
      },
      locationText: locationText,
      memoryText: memoryText
  });
}

// clears chosenCoords and input text
function clearUserInput() {
    // reset chosenCoords and input text
    chosenCoords = {};
    document.getElementById("location-text").value = "";
    document.getElementById("memory-text").value = "";

    // update location and marker statuses
    updateLocationStatus("Location Status: No location chosen yet");
}

function updateLocationStatus(text) {
  document.getElementById("loc-status").innerText = text;
}

function updateMarkerStatus(text) {
  document.getElementById("marker-status").innerText = text;
}

function initStreetMode() {
  // add event listener to the checkbox element
  let toggleContainer = document.getElementById("toggle-container");
  map.controls[google.maps.ControlPosition.TOP_LEFT].push(toggleContainer);
  let toggle = document.getElementById("streetmode-toggle");
  toggle.addEventListener("change", function(event) {
    if (this.checked) {
      streetMode = true;
      showMarkers3D();
      hideMarkers2D();
      zoomIn(currLoc);
    } else {
      streetMode = false;
      showMarkers2D();
      hideMarkers3D();
      zoomOut(currLoc);
    }
  });
}

function zoomIn(center) {
  map.setCenter(center);
  map.setZoom(19); // zoom in
  map.setTilt(90); // tilt down
}

function zoomOut(center) {
  map.setCenter(center);
  map.setZoom(14);  // zoom out
  map.setTilt(0);  // no tilt
}