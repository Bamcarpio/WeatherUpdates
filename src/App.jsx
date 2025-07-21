import React, { useState, useEffect, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getDatabase, ref, push, set, onValue } from 'firebase/database'; 



if (typeof L !== 'undefined') { 
  delete L.Icon.Default.prototype._getIconUrl;
  L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon-2x.png',
    iconUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png',
    shadowUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png',
  });
}



const App = () => {
  const [weatherData, setWeatherData] = useState(null);
  const [locationError, setLocationError] = useState('');
  const [loadingWeather, setLoadingWeather] = useState(true);
  const [userLatLon, setUserLatLon] = useState({ lat: 14.7921, lon: 120.8782 });
  const mapRef = useRef(null);
  const weatherLayerRef = useRef(null);
  const floodMarkersRef = useRef([]); 
  const [showGeolocationTip, setShowGeolocationTip] = useState(true); 

 
  const [db, setDb] = useState(null); 
  const [auth, setAuth] = useState(null);
  const [userId, setUserId] = useState(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [floodReports, setFloodReports] = useState([]);

  
  const mapSectionRef = useRef(null);


  
  const OPENWEATHER_API_KEY = 'c006710ad501bdbe1d47d7d180d51f64'; 


  const hotlines = [
    { name: 'National Disaster Risk Reduction & Management Council (NDRRMC)', number: '(02) 8911-5061 to 65' },
    { name: 'Philippine Red Cross', number: '143 or (02) 8790-2300' },
    { name: 'National Emergency Hotline', number: '911' },
    { name: 'MMDA (Metro Manila Development Authority)', number: '136' },
    { name: 'PNP (Philippine National Police) Hotline', number: '117 or 0917-847-5757' },
    { name: 'Bureau of Fire Protection (BFP)', number: '(02) 8426-0219' },
    { name: 'Department of Social Welfare and Development (DSWD)', number: '(02) 8931-8101 to 07' },
  ];

  // Firebase Initialization and Authentication
  useEffect(() => {
    const initFirebase = async () => { // Made this an async function
      try {
          // --- YOUR ACTUAL FIREBASE CONFIG ---
          // This config includes databaseURL for Realtime Database
          const firebaseConfig = {
            apiKey: "AIzaSyDlT5sCVMBZSWqYTu9hhstp4Fr7N66SWss",
            authDomain: "faceattendancerealtime-fbdf2.firebaseapp.com",
            databaseURL: "https://faceattendancerealtime-fbdf2-default-rtdb.firebaseio.com", // Crucial for RTDB
            projectId: "faceattendancerealtime-fbdf2",
            storageBucket: "faceattendancerealtime-fbdf2.appspot.com",
            messagingSenderId: "338410759674",
            appId: "1:338410759674:web:c6820d269c0029128a3043",
            measurementId: "G-NQDD7MCT09"
          };
          // For consistency, use projectId as the base for app-specific paths in RTDB
          const effectiveAppId = firebaseConfig.projectId; 
          // --- END FIREBASE CONFIG ---

          const app = initializeApp(firebaseConfig);
          const realtimeDb = getDatabase(app); // Get Realtime Database instance
          const firebaseAuth = getAuth(app);

          setDb(realtimeDb); // Set Realtime Database instance
          setAuth(firebaseAuth);

          // Ensure authentication completes before setting isAuthReady
          try {
            // Check if there's an existing user or sign in anonymously
            if (!firebaseAuth.currentUser) {
                await signInAnonymously(firebaseAuth);
            }
          } catch (error) {
            console.error("Firebase anonymous authentication error:", error);
            setLocationError("Failed to sign in anonymously. Community features may not work.");
          }

          // Set up auth state listener
          const unsubscribe = onAuthStateChanged(firebaseAuth, (user) => {
            if (user) {
              setUserId(user.uid);
              setIsAuthReady(true);
              console.log("Firebase User ID:", user.uid);
            } else {
              setUserId(null);
              setIsAuthReady(true); // Still ready, even if not authenticated
              console.log("No Firebase user is signed in.");
            }
          });

          return () => unsubscribe(); // Cleanup auth listener
      } catch (error) {
          console.error("Error initializing Firebase:", error);
          setLocationError("Failed to initialize Firebase services. Community features may not work.");
      }
    };

    initFirebase(); // Call the async function
  }, []); // Run once on component mount for Firebase setup

  // Effect to get user's geolocation and fetch weather
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { latitude, longitude } = position.coords;
          setUserLatLon({ lat: latitude, lon: longitude });
          fetchWeather(latitude, longitude);
          setShowGeolocationTip(false); // Hide tip if geolocation is successful
        },
        (error) => {
          console.error("Geolocation error:", error);
          setLocationError('Unable to retrieve your location. Displaying weather for Bulacan. Please ensure location permissions are granted in your browser settings.');
          fetchWeather(userLatLon.lat, userLatLon.lon); // Fetch for default Manila
          setShowGeolocationTip(true); // Show tip if geolocation fails
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      );
    } else {
      setLocationError('Geolocation is not supported by your browser. Displaying weather for Manila.');
      fetchWeather(userLatLon.lat, userLatLon.lon); // Fetch for default Manila
      setShowGeolocationTip(true); // Show tip if geolocation is not supported
    }
  }, []); // Run once on component mount

  // Function to fetch weather data
  const fetchWeather = async (lat, lon) => {
    setLoadingWeather(true);
    if (OPENWEATHER_API_KEY === 'YOUR_OPENWEATHERMAP_API_KEY' || !OPENWEATHER_API_KEY) {
      setLocationError('Please get your OpenWeatherMap API key and replace the placeholder in the code.');
      setLoadingWeather(false);
      return;
    }
    try {
      const response = await fetch(
        `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${OPENWEATHER_API_KEY}&units=metric`
      );
      if (!response.ok) {
        // More specific error message for 401 Unauthorized
        if (response.status === 401) {
          throw new Error(`Unauthorized: Please check your OpenWeatherMap API key. It might be incorrect or not activated yet.`);
        }
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      setWeatherData(data);
    } catch (error) {
      console.error("Error fetching weather data:", error);
      setLocationError(`Failed to fetch weather data: ${error.message}.`);
    } finally {
      setLoadingWeather(false);
    }
  };

  // Effect to initialize and update the map and add flood markers
  useEffect(() => {
    // Ensure Leaflet (L) is loaded before trying to use it
    if (typeof L === 'undefined') {
      console.warn("Leaflet (L) is not loaded. Please ensure you have added the Leaflet CDN script to your index.html.");
      return;
    }

    if (!mapRef.current) {
      // Initialize map only once
      const map = L.map('map').setView([userLatLon.lat, userLatLon.lon], 7); // Centered on user/Manila, zoom level 7

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      }).addTo(map);

      // Add OpenWeatherMap precipitation layer
      if (OPENWEATHER_API_KEY !== 'YOUR_OPENWEATHERMAP_API_KEY' && OPENWEATHER_API_KEY) {
        const precipitationLayer = L.tileLayer(
          `https://tile.openweathermap.org/map/precipitation_new/{z}/{x}/{y}.png?appid=${OPENWEATHER_API_KEY}`,
          {
            attribution: 'Weather data &copy; <a href="https://openweathermap.org">OpenWeatherMap</a>',
            opacity: 0.6 // Make it semi-transparent
          }
        ).addTo(map);
        weatherLayerRef.current = precipitationLayer;
      } else {
        console.warn("OpenWeatherMap API key not set for map layers.");
      }

      mapRef.current = map;
    } else {
      // If map exists, just update its view to the user's location
      mapRef.current.setView([userLatLon.lat, userLatLon.lon], mapRef.current.getZoom());
    }

    // Add flood reports to the map
    if (mapRef.current && floodReports.length > 0) {
      // Clear existing flood markers
      floodMarkersRef.current.forEach(marker => {
        if (mapRef.current.hasLayer(marker)) {
          mapRef.current.removeLayer(marker);
        }
      });
      floodMarkersRef.current = []; // Reset the array

      floodReports.forEach(report => {
        const markerColor = getFloodLevelColor(report.floodLevel);
        const customIcon = L.divIcon({
          className: 'custom-div-icon',
          html: `<div style="background-color: ${markerColor}; width: 30px; height: 30px; border-radius: 50%; border: 2px solid white; box-shadow: 0 0 5px rgba(0,0,0,0.5);"></div>`,
          iconSize: [30, 30],
          iconAnchor: [15, 30], // Anchor at the bottom center
          popupAnchor: [0, -20] // Adjust popup position
        });

        const marker = L.marker([report.latitude, report.longitude], { icon: customIcon }).addTo(mapRef.current);
        const timestamp = new Date(report.timestamp).toLocaleString();
        marker.bindPopup(`
          <div class="font-inter text-gray-800">
            <h3 class="font-bold text-lg mb-1">Flood Report</h3>
            <p><strong>Level:</strong> ${report.floodLevel}</p>
            <p><strong>Details:</strong> ${report.message || 'No additional details.'}</p>
            <p><strong>Reported:</strong> ${timestamp}</p>
           
          </div>
        `);
        floodMarkersRef.current.push(marker); // Add to ref for later clearing
      });
    }

  }, [userLatLon, OPENWEATHER_API_KEY, floodReports]); // Re-run if userLatLon, API key, or floodReports change

  // Function to get color based on flood level
  const getFloodLevelColor = (level) => {
    switch (level) {
      case 'No Flood': return '#4CAF50'; // Green
      case 'Ankle Deep': return '#8BC34A'; // Light Green
      case 'Knee Deep': return '#FFEB3B'; // Yellow
      case 'Waist Deep': return '#FFC107'; // Amber
      case 'Impassable': return '#F44336'; // Red
      default: return '#9E9E9E'; // Grey
    }
  };

  // Effect to fetch flood reports from Realtime Database
  useEffect(() => {
    if (db && isAuthReady) {
      const effectiveAppId = "faceattendancerealtime-fbdf2"; // Use your projectId for the path
      // Change path to listen for current status of each user
      const floodReportsRef = ref(db, `artifacts/${effectiveAppId}/public/data/currentFloodStatusByUsers`);
      console.log("Fetching flood reports from RTDB path:", `artifacts/${effectiveAppId}/public/data/currentFloodStatusByUsers`);

      // Use onValue to listen for data changes
      const unsubscribe = onValue(floodReportsRef, (snapshot) => {
        const data = snapshot.val();
        const reports = [];
        if (data) {
          // Realtime Database returns an object of objects, convert to array
          // Each key is now a userId
          for (let userIdKey in data) {
            reports.push({
              id: userIdKey, // The userId is now the ID
              userId: userIdKey, // Store userId explicitly if needed in the object
              ...data[userIdKey],
              // Ensure timestamp is a number for sorting
              timestamp: data[userIdKey].timestamp || Date.now()
            });
          }
        }
        // Sort reports by timestamp, newest first
        reports.sort((a, b) => b.timestamp - a.timestamp);
        setFloodReports(reports);
      }, (error) => {
        console.error("Error fetching flood reports from Realtime Database:", error);
        setLocationError("Failed to load community flood reports. Check your Realtime Database security rules.");
      });

      return () => unsubscribe(); // Cleanup listener
    }
  }, [db, isAuthReady]); // Re-run when db or auth state changes


  // Function to handle viewing a specific report on the map
  const handleViewOnMap = (lat, lon, message) => {
    if (mapRef.current) {
      mapRef.current.setView([lat, lon], 14); // Zoom to a closer level, e.g., 14

      // Auto-scroll to the map section
      if (mapSectionRef.current) {
        mapSectionRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }

      // Find the corresponding marker and open its popup
      const targetMarker = floodMarkersRef.current.find(marker => {
        const markerLatLon = marker.getLatLng();
        // Use a small tolerance for float comparison
        const tolerance = 0.000001;
        return Math.abs(markerLatLon.lat - lat) < tolerance && Math.abs(markerLatLon.lng - lon) < tolerance;
      });

      if (targetMarker) {
        targetMarker.openPopup();
      } else {
        // Fallback: If for some reason the marker isn't found in floodMarkersRef,
        // create a temporary one and open its popup.
        const tempMarker = L.marker([lat, lon]).addTo(mapRef.current);
        tempMarker.bindPopup(`
          <div class="font-inter text-gray-800">
            <h3 class="font-bold text-lg mb-1">Reported Location</h3>
            <p><strong>Details:</strong> ${message || 'No additional details.'}</p>
          </div>
        `).openPopup();
        // Optionally, remove this temporary marker after a short delay
        setTimeout(() => {
          if (mapRef.current.hasLayer(tempMarker)) {
            mapRef.current.removeLayer(tempMarker);
          }
        }, 5000);
      }
    }
  };


  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-100 to-indigo-200 font-inter text-gray-800 p-4 sm:p-6 md:p-8 flex flex-col items-center">
      <style>
        {`
          @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;600;700&display=swap');
          body { font-family: 'Inter', sans-serif; }
          #map {
            height: 400px;
            width: 100%;
            border-radius: 12px;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
            margin-top: 24px;
            margin-bottom: 24px;
          }
          .leaflet-control-attribution {
            background: rgba(255, 255, 255, 0.7) !important;
            padding: 4px 8px !important;
            border-radius: 6px !important;
          }
          /* Custom marker icon styling */
          .custom-div-icon {
            background-color: transparent;
            border: none;
          }
        `}
        {/* Leaflet CSS loaded via CDN */}
        <link rel="stylesheet" href="https://unpkg.com/leaflet@1.7.1/dist/leaflet.css"
          xintegrity="sha512-xod8SWTA+7f4xYJzQy9t+7x/W5f/fD/e/S6f/g/X8h/p/0/z/f/y/E/g/F/G/H/I/J/K/L/M/N/O/P/Q/R/S/T/U/V/W/X/Y/Z/a/b/c/d/e/f/g/h/i/j/k/l/m/n/o/p/q/r/s/t/u/v/w/x/y/z/0/1/2/3/4/5/6/7/8/9/+/="
          crossOrigin="" />
      </style>

      <h1 className="text-4xl sm:text-5xl font-extrabold text-blue-800 mb-6 text-center drop-shadow-lg">
        Philippines Crisis Response
      </h1>
      <p className="text-lg text-gray-700 mb-8 text-center max-w-2xl">
       Real-time ulan updates, rain map view, at important hotlines, all in one place.
      </p>

      {/* Geolocation Tip */}
      {showGeolocationTip && (
        <div className="bg-yellow-100 border border-yellow-400 text-yellow-800 px-4 py-3 rounded-lg relative w-full max-w-3xl mb-6 shadow-md" role="alert">
          <strong className="font-bold">Location Access Needed:</strong>
          <span className="block sm:inline ml-2">
            To get real-time weather for your current location, please enable location services for this site in your browser settings. The app will default to Bulacan if access is denied.
          </span>
          <span className="absolute top-0 bottom-0 right-0 px-4 py-3">
            <svg className="fill-current h-6 w-6 text-yellow-500 cursor-pointer" role="button" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" onClick={() => setShowGeolocationTip(false)}>
              <title>Close</title>
              <path d="M14.348 14.849a1.2 1.2 0 0 1-1.697 0L10 11.819l-2.651 3.029a1.2 1.2 0 1 1-1.697-1.697l2.758-3.15-2.759-3.152a1.2 1.2 0 1 1 1.697-1.697L10 8.183l2.651-3.031a1.2 1.2 0 1 1 1.697 1.697l-2.758 3.152 2.758 3.15a1.2 1.2 0 0 1 0 1.698z"/>
            </svg>
          </span>
        </div>
      )}

      {/* Weather Section */}
      <div className="bg-white p-6 sm:p-8 rounded-xl shadow-lg w-full max-w-3xl mb-8 border border-blue-200">
        <h2 className="text-3xl font-bold text-blue-700 mb-4 flex items-center">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 mr-3 text-blue-500" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2A10 10 0 1 0 22 12A10 10 0 0 0 12 2ZM12 20A8 8 0 1 1 20 12A8 8 0 0 1 12 20ZM12 4a8 8 0 0 0-7.07 12.07l.71-.71A7 7 0 0 1 12 5a7 7 0 0 1 7 7a7 7 0 0 1-7 7a7 7 0 0 1-7-7a1 1 0 0 0-2 0a9 9 0 0 0 9 9a9 9 0 0 0 9-9A9 9 0 0 0 12 4Z"/>
          </svg>
          Current Weather
        </h2>
        {locationError && (
          <p className="text-red-600 bg-red-100 p-3 rounded-md mb-4 border border-red-300">
            {locationError}
          </p>
        )}
        {loadingWeather ? (
          <div className="text-center py-4">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-500 mx-auto mb-2"></div>
            <p className="text-gray-600">Fetching weather data...</p>
          </div>
        ) : weatherData ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-lg">
            <div className="flex items-center">
              <span className="font-semibold text-gray-700 mr-2">Location:</span>
              <span className="text-blue-600">{weatherData.name}, {weatherData.sys.country}</span>
            </div>
            <div className="flex items-center">
              <span className="font-semibold text-gray-700 mr-2">Temperature:</span>
              <span className="text-blue-600">{weatherData.main.temp}°C</span>
            </div>
            <div className="flex items-center">
              <span className="font-semibold text-gray-700 mr-2">Conditions:</span>
              <span className="text-blue-600 capitalize">{weatherData.weather[0].description}</span>
              <img
                src={`https://openweathermap.org/img/wn/${weatherData.weather[0].icon}.png`}
                alt={weatherData.weather[0].description}
                className="w-10 h-10 ml-2"
              />
            </div>
            <div className="flex items-center">
              <span className="font-semibold text-gray-700 mr-2">Humidity:</span>
              <span className="text-blue-600">{weatherData.main.humidity}%</span>
            </div>
            <div className="flex items-center">
              <span className="font-semibold text-gray-700 mr-2">Wind Speed:</span>
              <span className="text-blue-600">{weatherData.wind.speed} m/s</span>
            </div>
          </div>
        ) : (
          <p className="text-center text-gray-600">No weather data available.</p>
        )}
      </div>
{/* Map Section */}
 <div ref={mapSectionRef} className="bg-white p-6 sm:p-8 rounded-xl shadow-lg w-full max-w-3xl mb-8 border border-blue-200">
   <h2 className="text-3xl font-bold text-blue-700 mb-4 flex items-center">
     <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 mr-3 text-blue-500" viewBox="0 0 24 24" fill="currentColor">
       <path d="M12 2A10 10 0 1 0 22 12A10 10 0 0 0 12 2ZM12 20A8 8 0 1 1 20 12A8 8 0 0 1 12 20ZM12 4a8 8 0 0 0-7.07 12.07l.71-.71A7 7 0
         0 1 12 5a7 7 0 0 1 7 7a7 7 0 0 1-7 7a7 7 0 0 1-7-7a1 1 0 0 0-2 0a9 9 0 0 0 9 9a9 9 0 0 0 9-9A9 9 0 0 0 12 4Z"/>
       <path d="M12 12.75a.75.75 0 0 1-.75-.75V6a.75.75 0 0 1 1.5 0v6a.75.75 0 0 1-.75.75Z"/>
       <path d="M12 17.5a.75.75 0
         0 1-.75-.75V15a.75.75 0 0 1 1.5 0v1.75a.75.75 0 0 1-.75.75Z"/>
     </svg>
     Rainfall Map & Flood Levels
   </h2>
   <div id="map" className="h-96 w-full rounded-lg shadow-md"></div>
   <p className="text-sm text-gray-600 mt-4">
     Makikita sa map na ’to ang current na lakas ng ulan.
     Mas dark ang kulay = mas malakas ang buhos, possible na signal ng masamang panahon o posibleng pagbaha.
   </p>
   <div className="mt-4 text-sm text-gray-700">
     <h4 className="font-semibold mb-2">Flood Level Legend:</h4>
     <ul className="grid grid-cols-2 sm:grid-cols-3 gap-2">
       <li><span className="inline-block w-3 h-3 rounded-full mr-2" style={{ backgroundColor: '#4CAF50' }}></span>Walang Baha</li>
       <li><span className="inline-block w-3 h-3 rounded-full mr-2" style={{ backgroundColor: '#8BC34A' }}></span>Ankle Deep</li>
       <li><span className="inline-block w-3 h-3 rounded-full mr-2" style={{ backgroundColor: '#FFEB3B' }}></span>Knee Deep</li>
       <li><span className="inline-block w-3 h-3 rounded-full mr-2" style={{ backgroundColor: '#FFC107' }}></span>Waist Deep</li>
       <li><span className="inline-block w-3 h-3 rounded-full mr-2" style={{ backgroundColor: '#F44336' }}></span>Impassable</li>
     </ul>
   </div>
 </div>

      {/* Community Flood Watch - New Feature */}
      <div className="bg-white p-6 sm:p-8 rounded-xl shadow-lg w-full max-w-3xl mb-8 border border-blue-200">
        <h2 className="text-3xl font-bold text-blue-700 mb-4 flex items-center">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 mr-3 text-blue-500" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v2h3l2.84 2.84c-.65.35-1.37.59-2.14.73zm7.45-2.73L15 14h-3V9l-5.16-5.16C7.38 3.23 8.66 3 10 3c3.87 0 7 3.13 7 7 0 1.34-.38 2.62-1.05 3.72z"/>
          </svg>
          Community Flood Watch
          {userId && (
            <span className="ml-auto text-sm text-gray-500"></span>
          )}
        </h2>
        <p className="text-gray-700 mb-4">
        Tulong-tulong tayo. I-update kung baha na sa lugar mo para aware din ’yung iba. Check real-time reports sa map sa taas.
        </p>
        <FloodReporter userLat={userLatLon.lat} userLon={userLatLon.lon} db={db} userId={userId} isAuthReady={isAuthReady} />
        <div className="mt-6">
          <h3 className="text-2xl font-bold text-blue-700 mb-3 flex items-center">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7 mr-2 text-blue-500" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v2h3l2.84 2.84c-.65.35-1.37.59-2.14.73zm7.45-2.73L15 14h-3V9l-5.16-5.16C7.38 3.23 8.66 3 10 3c3.87 0 7 3.13 7 7 0 1.34-.38 2.62-1.05 3.72z"/>
            </svg>
            Latest Flood Reports
          </h3>
          {floodReports.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {floodReports.slice(0, 6).map((report) => ( // Show up to 6 latest reports
                <div key={report.id} className="bg-blue-50 p-4 rounded-lg shadow-sm border border-blue-200">
                  <p className="font-semibold text-blue-800">{report.floodLevel}</p>
                  <p className="text-gray-700 text-sm">{report.message || 'No additional details.'}</p>
                  <p className="text-gray-500 text-xs mt-1">
                    {new Date(report.timestamp).toLocaleString()}
                  </p>
                  <button
                    onClick={() => handleViewOnMap(report.latitude, report.longitude, report.message)}
                    className="mt-2 bg-blue-500 hover:bg-blue-600 text-white text-xs font-bold py-1 px-3 rounded-full transition duration-200 ease-in-out"
                  >
                    View on Map
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-600">No flood reports yet. Be the first to report!</p>
          )}
        </div>
      </div>


      {/* Hotlines Section */}
      <div className="bg-white p-6 sm:p-8 rounded-xl shadow-lg w-full max-w-3xl mb-8 border border-blue-200">
        <h2 className="text-3xl font-bold text-blue-700 mb-4 flex items-center">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 mr-3 text-blue-500" viewBox="0 0 24 24" fill="currentColor">
            <path d="M6.62 10.79a15.05 15.05 0 0 0 6.59 6.59l2.21-2.21a1 1 0 0 1 1.05-.22a11.23 11.23 0 0 0 3.54.91a1 1 0 0 1 1 .91v3.5a1 1 0 0 1-1 1A19 19 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 .91 1a11.23 11.23 0 0 0 .91 3.54a1 1 0 0 1-.22 1.05l-2.21 2.21Z"/>
          </svg>
          Emergency Hotlines (Philippines)
        </h2>
        <ul className="list-disc pl-5 text-lg space-y-2">
          {hotlines.map((hotline, index) => (
            <li key={index} className="text-gray-700">
              <span className="font-semibold">{hotline.name}:</span>{' '}
              <a href={`tel:${hotline.number.replace(/\D/g, '')}`} className="text-blue-600 hover:underline">
                {hotline.number}
              </a>
            </li>
          ))}
        </ul>
      </div>

      {/* Safety Beacon - Unique Feature */}
      <div className="bg-white p-6 sm:p-8 rounded-xl shadow-lg w-full max-w-3xl border border-blue-200">
        <h2 className="text-3xl font-bold text-blue-700 mb-4 flex items-center">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 mr-3 text-blue-500" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2A10 10 0 1 0 22 12A10 10 0 0 0 12 2ZM12 20A8 8 0 1 1 20 12A8 8 0 0 1 12 20ZM12 4a8 8 0 0 0-7.07 12.07l.71-.71A7 7 0 0 1 12 5a7 7 0 0 1 7 7a7 7 0 0 1-7 7a7 7 0 0 1-7-7a1 1 0 0 0-2 0a9 9 0 0 0 9 9a9 9 0 0 0 9-9A9 9 0 0 0 12 4Z"/>
            <path d="M12 17.5a.75.75 0 0 1-.75-.75V15a.75.75 0 0 1 1.5 0v1.75a.75.75 0 0 1-.75.75Z"/>
            <path d="M12 12.75a.75.75 0 0 1-.75-.75V6a.75.75 0 0 1 1.5 0v6a.75.75 0 0 1-.75.75Z"/>
          </svg>
          Safety Beacon
        </h2>
        <p className="text-gray-700 mb-4">
        Send a quick status update with your location para alam ng fam, friends, or rescuers kung nasaan ka at anong need mo.
        </p>
        <SafetyBeacon userLat={userLatLon.lat} userLon={userLatLon.lon} />
      </div>
    
      {/* --- Developer Information --- */}
      <div className="bg-white p-6 sm:p-8 rounded-xl shadow-lg w-full max-w-3xl mt-8 border border-blue-200 text-center">
        <h2 className="text-2xl font-bold text-blue-700 mb-3">
          Developer Information (Hire me!)
        </h2>
        <p className="text-gray-700 text-lg">
          Developed by John Abraham SM Carpio
        </p>
        <p className="text-gray-700 text-md mt-2">
          Connect with me on LinkedIn: <a href="https://www.linkedin.com/in/john-abraham-sm-carpio-47ab91370/" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">John Abraham SM Carpio</a>
        </p>
      </div>
      {/* --- End Developer Information --- */}

    </div>
  );
};

// Safety Beacon Component (remains unchanged from your provided code)
const SafetyBeacon = ({ userLat, userLon }) => {
  const [location, setLocation] = useState('');
  const [status, setStatus] = useState('Safe and sound');
  const [customMessage, setCustomMessage] = useState('');
  const [contactNumber, setContactNumber] = useState('');
  const [generatedMessage, setGeneratedMessage] = useState('');
  const [copySuccess, setCopySuccess] = useState('');

  useEffect(() => {
    const fetchLocationName = async () => {
      const nominatimUrl = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${userLat}&lon=${userLon}`;
      try {
        const response = await fetch(nominatimUrl, {
          headers: { 'User-Agent': 'PhilippinesCrisisApp/1.0 (your-email@example.com)' }
        });
        const data = await response.json();
        if (data && data.display_name) {
          setLocation(data.display_name);
        } else {
          setLocation(`Lat: ${userLat.toFixed(4)}, Lon: ${userLon.toFixed(4)}`);
        }
      } catch (error) {
        console.error("Error fetching location name:", error);
        setLocation(`Lat: ${userLat.toFixed(4)}, Lon: ${userLon.toFixed(4)}`);
      }
    };

    if (userLat && userLon) {
      fetchLocationName();
    }
  }, [userLat, userLon]);

  const generateMessage = () => {
    let message = `Crisis Update: I am ${status}.`;
    if (location) {
      message += ` My approximate location is: ${location}.`;
    } else {
      message += ` My approximate coordinates are Lat: ${userLat.toFixed(4)}, Lon: ${userLon.toFixed(4)}.`;
    }
    if (customMessage) {
      message += ` Additional info: ${customMessage}.`;
    }
    if (contactNumber) {
      message += ` Please contact me at: ${contactNumber}.`;
    }
    message += ``;
    setGeneratedMessage(message);
    setCopySuccess('');
  };

  const copyToClipboard = () => {
    if (generatedMessage) {
      try {
        const textarea = document.createElement('textarea');
        textarea.value = generatedMessage;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        setCopySuccess('Message copied to clipboard!');
      } catch (err) {
        console.error('Failed to copy text: ', err);
        setCopySuccess('Failed to copy message.');
      }
    }
  };

  const shareViaSMS = () => {
    if (generatedMessage) {
      const smsLink = `sms:?body=${encodeURIComponent(generatedMessage)}`;
      window.open(smsLink, '_self');
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="location" className="block text-gray-700 text-sm font-bold mb-2">
          Your Current Location (e.g., "Bulacan, Philippines" or specific address):
        </label>
        <input
          type="text"
          id="location"
          className="shadow appearance-none border rounded-lg w-full py-3 px-4 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-blue-400"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          placeholder="e.g., My home in Quezon City"
        />
      </div>

      <div>
        <label htmlFor="status" className="block text-gray-700 text-sm font-bold mb-2">
          Your Status:
        </label>
        <select
          id="status"
          className="shadow border rounded-lg w-full py-3 px-4 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-blue-400"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="Safe and sound">Safe and sound</option>
          <option value="Need assistance (food, water, shelter)">Need assistance (pagkain, tubig, shelter)</option>
          <option value="Stranded (cannot move)">Stranded (cannot move)</option>
          <option value="Injured / Medical attention needed">Injured / Medical attention needed</option>
          <option value="Evacuated to a safe zone">Evacuated to a safe zone</option>
        </select>
      </div>

      <div>
        <label htmlFor="customMessage" className="block text-gray-700 text-sm font-bold mb-2">
          Additional Message (optional):
        </label>
        <textarea
          id="customMessage"
          rows="3"
          className="shadow appearance-none border rounded-lg w-full py-3 px-4 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-blue-400"
          value={customMessage}
          onChange={(e) => setCustomMessage(e.target.value)}
          placeholder="ex: Baha na hanggang bewang, waiting for rescue."
        ></textarea>
      </div>

      <div>
        <label htmlFor="contactNumber" className="block text-gray-700 text-sm font-bold mb-2">
          Contact Number (optional):
        </label>
        <input
          type="tel"
          id="contactNumber"
          className="shadow appearance-none border rounded-lg w-full py-3 px-4 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-blue-400"
          value={contactNumber}
          onChange={(e) => setContactNumber(e.target.value)}
          placeholder="e.g., +639171234567"
        />
      </div>

      <button
        onClick={generateMessage}
        className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-lg shadow-md transition duration-300 ease-in-out transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2"
      >
        Generate Safety Message
      </button>

      {generatedMessage && (
        <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg shadow-inner">
          <p className="font-semibold text-blue-800 mb-2">Your Generated Message:</p>
          <p className="text-gray-800 break-words bg-white p-3 rounded-md border border-gray-200">
            {generatedMessage}
          </p>
          <div className="flex flex-col sm:flex-row gap-3 mt-4">
            <button
              onClick={copyToClipboard}
              className="flex-1 bg-green-500 hover:bg-green-600 text-white font-bold py-2 px-4 rounded-lg shadow-md transition duration-300 ease-in-out transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-green-400 focus:ring-offset-2"
            >
              Copy to Clipboard
            </button>
            <button
              onClick={shareViaSMS}
              className="flex-1 bg-purple-500 hover:bg-purple-600 text-white font-bold py-2 px-4 rounded-lg shadow-md transition duration-300 ease-in-out transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-purple-400 focus:ring-offset-2"
            >
              Share via SMS (Mobile Only)
            </button>
          </div>
          {copySuccess && <p className="text-green-600 text-center mt-2">{copySuccess}</p>}
        </div>
      )}
    </div>
  );
};

// Flood Reporter Component
const FloodReporter = ({ userLat, userLon, db, userId, isAuthReady }) => {
  const [floodLevel, setFloodLevel] = useState('No Flood');
  const [message, setMessage] = useState('');
  const [reportStatus, setReportStatus] = useState('');
  const [loadingReport, setLoadingReport] = useState(false);

  const handleSubmit = async () => {
    if (!db || !isAuthReady || !userId) { // Ensure userId is available for updating
      setReportStatus("App is not ready or user not authenticated. Please wait.");
      return;
    }
    if (!userLat || !userLon) {
      setReportStatus("Your location is not available. Please enable geolocation.");
      return;
    }

    setLoadingReport(true);
    setReportStatus('');

    try {
      const effectiveAppId = "faceattendancerealtime-fbdf2"; // Use your projectId for the path
      // Path for the current user's flood status
      const userFloodStatusRef = ref(db, `artifacts/${effectiveAppId}/public/data/currentFloodStatusByUsers/${userId}`);
      console.log("Submitting/Updating flood report to RTDB path:", `artifacts/${effectiveAppId}/public/data/currentFloodStatusByUsers/${userId}`);

      // Use set() to overwrite the existing report for this user, or create a new one
      await set(userFloodStatusRef, {
        latitude: userLat,
        longitude: userLon,
        floodLevel: floodLevel,
        message: message,
        timestamp: Date.now(), // Use client-side timestamp for RTDB
        // userId is implicitly part of the path, no need to store it inside the object
      });
      setReportStatus('Success!');
      setMessage(''); // Clear message after submission
      setFloodLevel('No Flood'); // Reset flood level
    } catch (error) {
      console.error("Error adding/updating flood report:", error);
      setReportStatus(`Failed to submit report: ${error.message}. Please check Realtime Database rules.`);
    } finally {
      setLoadingReport(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="floodLevel" className="block text-gray-700 text-sm font-bold mb-2">
          Current Flood Level at Your Location:
        </label>
        <select
          id="floodLevel"
          className="shadow border rounded-lg w-full py-3 px-4 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-blue-400"
          value={floodLevel}
          onChange={(e) => setFloodLevel(e.target.value)}
        >
          <option value="No Flood">No Flood – Walang baha, all good dito.</option>
          <option value="Ankle Deep"> Ankle Deep – Medyo basa lang, abot sa sakong.</option>
          <option value="Knee Deep">Knee Deep – Baha na, abot tuhod.</option>
          <option value="Waist Deep"> Waist Deep – Serious na, abot balakang.</option>
          <option value="Impassable"> Impassable – Di na madaanan, lagpas bewang or mas mataas pa.</option>
        </select>
      </div>

      <div>
        <label htmlFor="reportMessage" className="block text-gray-700 text-sm font-bold mb-2">
          Additional Details (optional):
        </label>
        <textarea
          id="reportMessage"
          rows="2"
          className="shadow appearance-none border rounded-lg w-full py-3 px-4 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-blue-400"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="e.g., Mabilis ang pagtaas ng tubig."
        ></textarea>
      </div>

      <button
        onClick={handleSubmit}
        disabled={loadingReport || !isAuthReady || !db || !userId} // Disable if userId is not ready
        className={`w-full font-bold py-3 px-6 rounded-lg shadow-md transition duration-300 ease-in-out transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-offset-2
          ${loadingReport || !isAuthReady || !db || !userId
            ? 'bg-gray-400 cursor-not-allowed'
            : 'bg-blue-600 hover:bg-blue-700 text-white focus:ring-blue-400'
          }`}
      >
        {loadingReport ? (
          <div className="flex items-center justify-center">
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
            Reporting...
          </div>
        ) : (
          'Submit Flood Report'
        )}
      </button>

      {reportStatus && (
        <p className={`mt-2 text-center text-sm ${reportStatus.includes('successfully') ? 'text-green-600' : 'text-red-600'}`}>
          {reportStatus}
        </p>
      )}
    </div>
  );
};

export default App;
