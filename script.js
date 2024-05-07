import * as THREE from 'three';
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader";
import { ThreeJSOverlayView } from "@googlemaps/three";
// import { postprocessing } from './postprocessing'
import gsap from 'gsap';

const NEW_YORK_BOUNDS = {
  north: 41.04,
  south: 40.38,
  west: -74.37,
  east: -73.58
};
const CENTER = { lat: 40.71, lng: -73.97 };

const roughNYCBounds = [
  { lat: 40.487, lng: -74.276 },
  { lat: 40.661, lng: -74.210 },
  { lat: 40.658, lng: -74.059 },
  { lat: 40.775, lng: -74.013 },
  { lat: 40.935, lng: -73.915 },
  { lat: 40.880, lng: -73.748 },
  { lat: 40.813, lng: -73.769 },
  { lat: 40.752, lng: -73.691 },
  { lat: 40.593, lng: -73.730 },
  { lat: 40.535, lng: -73.948 },
  { lat: 40.488, lng: -74.259 }
];

let roughNYCArea;

// general map stuff
let map;
const mapOptions = {
  center: CENTER,
  zoom: 10,
  minZoom: 10,
  maxZoom: 19,
  tilt: 0,
  mapId: '91730daa8c535619',
  mapTypeId: 'roadmap',
  // disable controls code from https://stackoverflow.com/questions/5976854/how-to-disable-google-maps-satellite-view
  mapTypeControlOptions: {
    // mapTypeIds: [google.maps.MapTypeId.ROADMAP, google.maps.MapTypeId.HYBRID]
    // mapTypeId: 'satellite'
  }, // here´s the array of controls
  disableDefaultUI: true, // a way to quickly hide all controls
  clickableIcons: false, // disable ability to click on default POIs outside of NYC
  // restrict it to NYC
  restriction: {
    latLngBounds: NEW_YORK_BOUNDS,
    strictBounds: false
  },
};

let infoWindow;
let chosenCoords;
let badLoc;
let bounds;
let database; // firebase database
let currLoc = null;
let currLocMarker;
let previewMarker;
let inPersonMode;
let markers2D = [];
let markers3D = [];
let idToGrow;

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
let modelScale;
let composer;

// document.addEventListener('DOMContentLoaded', () => {
//   initMap();
// });

// window.onload = () => {
//   initMap();
// };
window.addEventListener("load", initMap);

function initMap() {
    // create map, initialize properties
    map = new google.maps.Map(document.getElementById("map"), mapOptions);
    
    // create info window to display story text
    infoWindow = new google.maps.InfoWindow({disableAutoPan: true});
 
    // create bounds
    bounds = new google.maps.LatLngBounds();

    roughNYCArea = new google.maps.Polygon({ paths: roughNYCBounds, fillColor: "#FF0000",
    fillOpacity: 0.35 });

    // add geoJson to the data-layer
    map.data.loadGeoJson('/boundaries.geojson');

    inPersonMode = false;
    badLoc = false;

    // initialize previewMarker with image, don't show it yet
    previewMarker = new google.maps.Marker({
      position: null,
      map: null,
      icon: {
        scaledSize: new google.maps.Size(24, 24),
        url: "/transparent_circle.png",
        anchor: new google.maps.Point(12, 12),
      }
    });

    // initialize currLocMarker with image, don't show it yet
    currLocMarker = new google.maps.Marker({
      position: null,
      map: null,
      icon: {
        scaledSize: new google.maps.Size(40, 55),
        url: "/inperson_white.png"
      }
    });

    // define bounds of each borough according to json file
    // brian's code
    map.data.addListener('addfeature', function (event) {
      const geometry = event.feature.getGeometry()
      processPoints(geometry, bounds.extend, bounds)
      map.fitBounds(bounds)
    });

    // Set mouseover event for each feature.
    map.data.addListener('mouseover', function(event) {
      if (!chosenCoords) {
        updatePickPlaceStatus("click on the map to drop a pin!");
      }
    });

    map.data.addListener('mouseout', function(event) {
      if (!chosenCoords) {
        updatePickPlaceStatus("oops, this isn't nyc anymore...");
      }
    });

    // don't show "oops" message if mouse is over side panel and hasn't chosen anything yet
    const sidePanel = document.querySelector('.side-panel');
    sidePanel.addEventListener('mouseover', function(event) {
      if (!chosenCoords && !badLoc) {
        updatePickPlaceStatus("click on the map to drop a pin!");
      }
    });

    // tint NYC area a bit
    map.data.setStyle({
      fillColor: "#a8c1ff",
      fillOpacity: 0.1,
      strokeColor: "#4d7bcb",
      strokeWeight: 1,
    });

    // set up firebase
    config();
    database = firebase.database();

    // set up threejs stuff
    initThreeJS();
    // allow app to detect user location
    // locateUser(false);
    // detect location on first loading
    initCurrentLoc();
    // allow user to search for a place
    initLocationSearch();
    // allow map to detect clicks
    initClickListener();
    // set up button controls in top right (for in-person mode, locate me)
    initControls();
    // set up side panel for submitting a new memory
    initSidePanel();
    // set up correct actions for submitting a new memory
    initForm();
    // populate map
    populateMap2D(); // load all 2D markers
    populateMap3D(scene); // load all 3D markers
    hideMarkers3D(); // hide 3D scene initially
    raycast(); // init click listener for 3D markers
}

// set up firebase
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

// set up threejs
function initThreeJS() {
  scene = new THREE.Scene()
  ambientLight = new THREE.AmbientLight(0xa38e9c, 0.75)
  scene.add(ambientLight)
  directionalLight = new THREE.DirectionalLight(0xffffff, 0.25)
  directionalLight.position.set(0, 10, 50)
  // scene.add(directionalLight)
  loader = new GLTFLoader();
  modelScale = 10;

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

  // composer = postprocessing(scene, camera, renderer);
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

// controls for "locate me" and "in person mode"
function initControls() {
  const locationBtn = document.getElementById("locateme-button");
  const inpersonBtn = document.getElementById("inperson-button");
  const locatemeImage = document.getElementById("locateme-image");

  locationBtn.addEventListener("click", locateUser);
  inpersonBtn.addEventListener("click", toggleInPerson);

  locationBtn.addEventListener("mousedown", () => {
      locatemeImage.src = "locateme_black.png";
  });

  locationBtn.addEventListener("mouseup", () => {
      locatemeImage.src = "locateme_outline.png";
  });
}

// modify DOM elements and adjust map display when user toggles in-person mode
function toggleInPerson() {
  const inpersonText = document.getElementById("inperson-text");
  const inpersonImg = document.getElementById("inperson-image");

  if (!inPersonMode) {
    inPersonMode = true;
    inpersonText.textContent = "In Person Mode: On";
    inpersonText.style.marginRight = "6px";
    inpersonImg.src = "inperson_black.png";
    showMarkers3D();
    hideMarkers2D();
    if (currLoc) {
      zoomIn(currLoc);
    } else {
      locateUser();
    }
  } else {
    inPersonMode = false;
    inpersonText.textContent = "In Person Mode: Off";
    inpersonText.style.marginRight = "0px";
    inpersonImg.src = "inperson_outline.png";
    showMarkers2D();
    hideMarkers3D();
    infoWindow.close();
    zoomOut(currLoc);
  }
  // console.log(markers2D.length);
}

// detect location on first loading
function initCurrentLoc() {
    locateUser(false); // don't zoom to user's loc on first loading
}

// find user's location
function locateUser(zoom = true) {
  // begins loading location
  // Try HTML5 geolocation.
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
        async (position) => {
          const pos = {
              lat: position.coords.latitude,
              lng: position.coords.longitude,
          };
          // update location of currLocMarker, show on map
          await currLocMarker.setMap(map);
          await currLocMarker.setPosition(pos);
          currLoc = pos;
          
          // done loading location

          if (currLoc) {
            handleLocationSuccess(currLoc);
            if (zoom) {
              zoomIn(currLoc);
            }
          }

        }, () => {
        handleLocationError(true, infoWindow, map.getCenter());
        },
    );
    } else {
      // Browser doesn't support Geolocation
      handleLocationError(false, infoWindow, map.getCenter());
    }
}

// unhide location-based controls
function handleLocationSuccess(pos) {
  // console.log("location success");
  const locateMe = document.getElementById("locateme-button");
  locateMe.classList.remove("hidden");
  const inPerson = document.getElementById("inperson-button");
  inPerson.classList.remove("hidden");
}

function handleLocationError(browserHasGeolocation, infoWindow, pos) {
    // infoWindow.setPosition(pos);
    // infoWindow.setContent(
    //   browserHasGeolocation
    //     ? "Error: The Geolocation service failed."
    //     : "Error: Your browser doesn't support geolocation.",
    // );
    // infoWindow.open(map);
    // console.log("location error");
}

// from https://developers.google.com/maps/documentation/javascript/examples/places-searchbox
// https://stackoverflow.com/questions/29869261/google-map-search-box
function initLocationSearch() {
    // Create the search box and link it to the UI element.
    const input = document.getElementById("search-input");
    const searchBox = new google.maps.places.SearchBox(input);

    // figure out how to prevent enter from autocompleting search
    // input.addEventListener("keypress", function (event) {
    //   if (event.key === 'Enter') {
    //       event.stopPropagation();
    //       console.log('pressed enter');
    //       return false;
    //   }
    // });

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
          // Check if the chosen location is within allowed bounds
          if (google.maps.geometry.poly.containsLocation(place.geometry.location, roughNYCArea)) {
            // display previewMarker at the chosen search result
            previewMarker.setPosition(place.geometry.location);
            previewMarker.setMap(map);

            previewMarker.bindTo('map', searchBox, 'map');
            // google.maps.event.addListener(previewMarker, 'map_changed', function() {
            //   if (!this.getMap()) {
            //     this.unbindAll();
            //   }
            // });
            bounds.extend(place.geometry.location);
            chosenCoords = place.geometry.location;
            const roundedCoords = {
              lat: chosenCoords.lat().toFixed(3),
              lng: chosenCoords.lng().toFixed(3)
            };
            
            // update location status
            updatePickPlaceStatus("searched up (" + roundedCoords.lat + ", " + roundedCoords.lng + ")");
            badLoc = false;
            // update location text box
            document.getElementById("location-text").value = place.name;
          } else {
            // location is outside allowed bounds
            updatePickPlaceStatus("oops, this isn't nyc anymore...");
            // hide preview marker
            previewMarker.setPosition(null);
            previewMarker.setMap(null);
            badLoc = true;
            // update location text box
            document.getElementById("location-text").value = "";
            // console.log(chosenCoords);
          }
        } (place));
      }
      map.fitBounds(bounds);
      searchBox.set('map', map);

      // zoom in/out on map depending on if user searched up valid location
      if (!badLoc) {
        zoomIn(chosenCoords);
      } else {
        zoomCompletelyOut();
      }
    });
}

// click listener for whenever user clicks within the borough boundaries of NYC
function initClickListener(){
  map.data.addListener("click", function(mapsMouseEvent) {
    chosenCoords = mapsMouseEvent.latLng;
    const roundedCoords = {
      lat: chosenCoords.lat().toFixed(3),
      lng: chosenCoords.lng().toFixed(3)
    };
    // update location status
    updatePickPlaceStatus("clicked on (" + roundedCoords.lat + ", " + roundedCoords.lng + ")");
    // display preview marker
    previewMarker.setPosition(chosenCoords);
    previewMarker.setMap(map);
    infoWindow.close();
    badLoc = false;
  });

  // click outside of the NYC area (map.data is the nyc data layer)
  map.addListener("click", function(mapsMouseEvent) {
    chosenCoords = null;
    // update location status
    updatePickPlaceStatus("oops, this isn't nyc anymore...");
    // hide preview marker
    previewMarker.setPosition(null);
    previewMarker.setMap(null);
    infoWindow.close();
    badLoc = true;
  });
}

// side panel for adding new memory
function initSidePanel() {
  document.querySelector(".side-panel-heading").addEventListener("click", () => {
    document.querySelector(".side-panel").classList.toggle("is-open");
  });
}

// add event listener to form for adding memories to database
function initForm() {
  // prevent enter from submitting
  document.getElementById("marker-form").addEventListener("keypress", function (event) {
    if (event.key === 'Enter') {
        event.preventDefault();
        return false;
    }
  });

  // Add event listener to the form
  document.getElementById("marker-form").addEventListener("submit", function(event) {
    event.preventDefault(); // Prevent default form submission
    // Check if the input field has text entered
    const locationText = document.getElementById("location-text").value.trim();
    const timeText = document.getElementById("time-text").value.trim();
    const memoryText = document.getElementById("memory-text").value.trim();
    if (locationText && timeText && memoryText && chosenCoords) {
        // hide previewMarker
        previewMarker.setPosition(null);
        previewMarker.setMap(null);
        // add a marker
        addMarker(chosenCoords, locationText, timeText, memoryText);
        
        // clear chosenCoords and text
        clearUserInput();
    } else {
        alert("Finish all of the steps to submit a memory!"); // Show an alert if no text is entered
    }
  });
}

// adds a new marker with given coords, locationText, timeText, memoryText
// both the marker2D and marker3D arrays are updated
function addMarker(coords, locationText, timeText, memoryText) {
  // check that we are able to add marker
  if (coords && locationText && timeText && memoryText) {
    // save to firebase --> this will be caught by the populateMap3D function
    const markerId = saveMarkerToFirebase(coords, locationText, timeText, memoryText);

    // create marker
    const marker = new google.maps.Marker({
      position: coords,
      map: map,
      icon: {
        scaledSize: new google.maps.Size(30, 55),
        url: "/daffodil.png"
      }
    });
      
    // set up click listener
    marker.addListener('click', function() {
        infoWindow.setContent(formatContentString(locationText, timeText, memoryText, false));
        infoWindow.open(map, marker);
    });

    // show infoWindow upon adding
    infoWindow.setContent(formatContentString(locationText, timeText, memoryText, false));
    infoWindow.open(map, marker);

    // hide 2D marker if added in in-person mode
    if (inPersonMode) {
      marker.setMap(null);
    }

    // add to the markers2D array
    markers2D.push({ id: markerId, marker });
  }
}

// save marker to firebase using given coords, locationText, timeText, memoryText
// returns {string} the ID of the newly created entry.
function saveMarkerToFirebase(coords, locationText, timeText, memoryText) {
  const lat = coords.lat();
  const lng = coords.lng();
  
  // save to database
  const newEntry = database.ref("memories").push({
      coords: {
        lat: lat,
        lng: lng
      },
      locationText: locationText,
      timeText: timeText,
      memoryText: memoryText,
      numVisits: 0
  });

  // return the id of the marker we just pushed
  return newEntry.key;
}

// populate map with 2D markers for existing entries in database
function populateMap2D() {
  database.ref("memories").once('value', (snapshot) => {
    snapshot.forEach((childSnapshot) => {
      // var childKey = childSnapshot.key;
      var childData = childSnapshot.val();
      const markerId = childSnapshot.key;

      // create a marker
      const marker = new google.maps.Marker({
        map: map,
        position: childData.coords,
        icon: {
          scaledSize: new google.maps.Size(30, 55),
          url: "/daffodil.png"
        }
      });

      marker.addListener('click', function () {
        infoWindow.setContent(formatContentString(childData.locationText, childData.timeText, childData.memoryText, false));
        infoWindow.open(map, marker);
      });

      markers2D.push({ id: markerId, marker });
    });
  });
}

// from https://developers.google.com/maps/documentation/javascript/examples/marker-remove#maps_marker_remove-javascript
// Sets the map on all markers in the array.
function setMapOnAll(map) {
  for (let i = 0; i < markers2D.length; i++) {
    markers2D[i].marker.setMap(map);
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
      const markerId = childSnapshot.key;
      const position = childData.coords;
      const numVisits = childData.numVisits;
      const scaleUp = numVisits;

      loader.load("../daffodil.glb", (gltf) => {
        const model = gltf.scene;
        model.name = 'daffodil';
        model.rotation.x = Math.PI / 2;
        model.rotation.y = Math.random() * 2 * Math.PI;
        model.scale.set(modelScale + scaleUp, modelScale + scaleUp, modelScale + scaleUp);

        // custom property to store extra data
        model.userData = {
          id: markerId,
          scale: modelScale + scaleUp,
          position: position,
          locationText: childData.locationText,
          timeText: childData.timeText,
          memoryText: childData.memoryText,
          numVisits: childData.numVisits
        };

        // convert marker position to vector3
        const markerPosition = overlay.latLngAltitudeToVector3({
          ...position,
          altitude: 0,
        });

        model.position.copy(markerPosition);
        scene.add(model);

        // store the loaded model in the markers array
        markers3D.push(model);
      });
    });
    initialLoadComplete = true;
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
        model.rotation.y = Math.random() * 2 * Math.PI;
        model.scale.set(modelScale, modelScale, modelScale);

        // custom property to store extra data
        model.userData = {
          id: markerId,
          position: position,
          locationText: childData.locationText,
          timeText: childData.timeText,
          memoryText: childData.memoryText,
          numVisits: childData.numVisits
        };

        model.position.copy(
          overlay.latLngAltitudeToVector3({
            ...position,
            altitude: 0,
          })
        );
        scene.add(model);
        // console.log("add 3D model based on change in database");

        // store the loaded model in the markers array
        markers3D.push(model);
      });
    }
  });
}

function hideMarkers3D() {
  scene.visible = false;
  overlay.requestRedraw();
}

function showMarkers3D() {
  scene.visible = true;
  overlay.requestRedraw();
}

// add click listener for 3D models
function raycast() {
  window.addEventListener('click', (event) => {
      if (inPersonMode) {
          const mousePosition = new THREE.Vector2()

          const mapDiv = map.getDiv()
          const { left, top, width, height } = mapDiv.getBoundingClientRect()

          const x = event.clientX - left
          const y = event.clientY - top
          mousePosition.x = 2 * (x / width) - 1
          mousePosition.y = 1 - 2 * (y / height)

          // raycaster results
          const resultsArr = overlay.raycast(mousePosition);

          // if user clicked on a flower
          if (resultsArr.length > 0) {
            // closest result
            let closest = resultsArr[0].object;

            // accessing nested parents until i find the 
            // "parent" element whose name property is "daffodil"
            // (closest.parent.parent.parent... etc)
            while (closest) {
              if (closest.name === "daffodil") {
                  // found the desired element
                  break;
              }
              // move to the parent object
              closest = closest.parent;
            }
          
            // now closest points to the "parent" element with name "daffodil" if found
            if (closest) {
              // populate and open the info window of the clicked-on element
              let closestData = closest.userData;

              // figure out how far user is from the clicked-on marker
              let dist = getDistanceFromLatLngInMeters(currLoc.lat, currLoc.lng, closestData.position.lat, closestData.position.lng);
              // console.log(dist);
              
              // markers2D and markers3D have same ids, match corresponding model to marker
              // need 2D marker to pass into infoWindow.open
              let id = closestData.id;
              let marker = get2DMarkerById(id);
              idToGrow = id;
              // console.log(marker);

              // display info window content based on how far user is
              if (dist < 100) {
                infoWindow.setContent(formatContentString(closestData.locationText, closestData.timeText, closestData.memoryText, true));
              } else {
                infoWindow.setContent(formatContentString(closestData.locationText, closestData.timeText, closestData.memoryText, false));
              }

              infoWindow.setPosition(closestData.position);
              infoWindow.open(map, marker);
              
              const shedLightBtn = document.getElementById('shed-light-btn');
              shedLightBtn.addEventListener('click', shedLight);
            }
          }
          overlay.requestRedraw();
      }
  })
}

// function to access a specific marker by its id
function get2DMarkerById(id) {
  const foundMarkerData = markers2D.find(markerData => markerData.id === id);
  if (foundMarkerData) {
    return foundMarkerData.marker;
  } else {
    return null;
  }
}

// formats the content inside info window based on if user is in close range or not
function formatContentString(locationText, timeText, memoryText, closeRange = false) {
  let contentString;
  if (inPersonMode && closeRange) {
    contentString =
    '<div id="info-window-content">' + '<div id="siteNotice">' + "</div>" +
      '<p id="window-location-text" style="font-size: 14px; font-weight: 600;">' +
        '<img src="locateme_black.png" style="width: 10px; height: 12px; position: relative; top: 1px; margin-right: 5px;">' +
        locationText + '</p>' +
      '<p id="window-time-text" style="font-size: 14px; font-weight: 600;">' +
        '<img src="clock.png" style="width: 12px; height: 12px; position: relative; top: 1px; margin-right: 5px;">' +
        timeText + '</p>' +
      '<div id="bodyContent">' +
        "<p>" + memoryText + "</p>" +
        '<button id="shed-light-btn">☀ shed light on memory</button>' +
      "</div>" + 
    "</div>";
  } else {
    contentString =
    '<div id="info-window-content">' + '<div id="siteNotice">' + "</div>" +
      '<p id="window-location-text" style="font-size: 14px; font-weight: 600;">' +
        '<img src="locateme_black.png" style="width: 10px; height: 12px; position: relative; top: 1px; margin-right: 5px;">' +
        locationText + '</p>' +
      '<p id="window-time-text" style="font-size: 14px; font-weight: 600;">' +
        '<img src="clock.png" style="width: 12px; height: 12px; position: relative; top: 1px; margin-right: 5px;">' +
        timeText + '</p>' +
      '<div id="bodyContent">' +
        "<p>" + memoryText + "</p>" +
        '<p style="font-size: 12px; font-style: italic;">visit in-person to interact</p>' +
        // '<button style="background-color: white; color: black; padding: 5px 10px; margin-bottom: 5px; border-radius: 20px; border-width: thin;">visit me to interact!</button>' +
        // '<button id="shed-light-btn" style="background-color: white; color: black; padding: 5px 10px; margin-bottom: 5px; border-radius: 20px; border-width: thin;">☀ shed light on memory</button>' +
      "</div>" + 
    "</div>";
  }
  return contentString;
}

function shedLight() {
  // increment the entry's numVisits property in database
  const entryRef = database.ref('memories').child(idToGrow);
  entryRef.transaction(currentData => {
    if (currentData === null) {
      // if numVisits doesn't exist, set it to 1
      return { numVisits: 1 };
    } else {
      // increment numVisits by 1
      if (!currentData.numVisits) currentData.numVisits = 0;
      currentData.numVisits++;
      return currentData;
    }
  })
  .then(transactionResult => {
    if (transactionResult.committed) {
      // console.log('numVisits updated successfully.');
      // scale flower up
      infoWindow.close();

      const model = markers3D.find(model => model.userData.id === idToGrow);

      // console.log("scaling up");
      gsap.to(model.scale, {
        x: "+=3",
        y: "+=3",
        z: "+=3",
        duration: 3,
        onUpdate: () => overlay.requestRedraw(),
      });
    } else {
      // console.log('Transaction aborted.');
    }
  })
  .catch(error => {
    console.error('Error updating numVisits:', error);
  });
  
}

// clears chosenCoords and input text
function clearUserInput() {
    // reset chosenCoords and input text
    chosenCoords = {};
    document.getElementById("location-text").value = "";
    document.getElementById("time-text").value = "";
    document.getElementById("memory-text").value = "";
    document.getElementById("search-input").value = "";
}

function updatePickPlaceStatus(text) {
  document.getElementById("pick-place-status").innerText = text;
}

function zoomIn(center) {
  map.setCenter(center);
  map.setZoom(19); // zoom in
  map.setTilt(45); // tilt down
}

function zoomOut(center) {
  map.setCenter(center);
  map.setZoom(14);  // zoom out
  map.setTilt(0);  // no tilt
}

function zoomCompletelyOut() {
  map.setCenter(CENTER);
  map.setZoom(10);  // zoom out
  map.setTilt(0);  // no tilt
}

// haversine formula for straight-line distance
// returns distance in meters
// from https://stackoverflow.com/questions/18883601/function-to-calculate-distance-between-two-coordinates
function getDistanceFromLatLngInMeters(lat1, lng1, lat2, lng2) {
  var R = 6371; // Radius of the earth in km
  var dLat = deg2rad(lat2-lat1);  // deg2rad below
  var dlng = deg2rad(lng2-lng1); 
  var a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) * 
    Math.sin(dlng/2) * Math.sin(dlng/2)
    ; 
  var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
  var d = R * c * 1000; // Distance in meters
  return d;
}

function deg2rad(deg) {
  return deg * (Math.PI/180)
}