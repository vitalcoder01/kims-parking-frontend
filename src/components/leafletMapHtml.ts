// Free, open-source live driver map: Leaflet (BSD-2-Clause) rendering
// OpenStreetMap tiles (ODbL, no API key required) inside a WebView — no
// Google Maps SDK, no billing account, no key to configure.
//
// window.updateMarkers(drivers, shouldFit) is called from the RN side via
// injectJavaScript on every socket delta; the map instance itself is only
// created once (on page load), so updates never reload the WebView.
export const LEAFLET_MAP_HTML = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <style>
    html, body, #map { height: 100%; margin: 0; padding: 0; background: #e8e8e8; }
  </style>
</head>
<body>
  <div id="map"></div>
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <script>
    var map = L.map('map', {zoomControl: false, attributionControl: false}).setView([20.5937, 78.9629], 5);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
    }).addTo(map);

    var markers = {};

    function markerIcon(onJob) {
      var color = onJob ? '#E65100' : '#1B5E20';
      return L.divIcon({
        className: '',
        html: '<div style="width:16px;height:16px;border-radius:8px;background:' + color + ';border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,0.4);"></div>',
        iconSize: [16, 16],
        iconAnchor: [8, 8],
      });
    }

    window.updateMarkers = function(drivers, shouldFit) {
      var seen = {};
      drivers.forEach(function(d) {
        seen[d.id] = true;
        var latlng = [d.lat, d.lng];
        if (markers[d.id]) {
          markers[d.id].setLatLng(latlng);
          markers[d.id].setIcon(markerIcon(d.onJob));
          markers[d.id].setPopupContent(d.name + ' — ' + d.job);
        } else {
          markers[d.id] = L.marker(latlng, {icon: markerIcon(d.onJob)})
            .addTo(map)
            .bindPopup(d.name + ' — ' + d.job);
        }
      });
      Object.keys(markers).forEach(function(id) {
        if (!seen[id]) {
          map.removeLayer(markers[id]);
          delete markers[id];
        }
      });
      if (shouldFit && drivers.length > 0) {
        var bounds = L.latLngBounds(drivers.map(function(d) { return [d.lat, d.lng]; }));
        map.fitBounds(bounds, {padding: [50, 50]});
      }
    };
  </script>
</body>
</html>`;
