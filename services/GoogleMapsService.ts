/**
 * Decodes a Google Maps encoded polyline string into an array of coordinates.
 * Algorithm: https://developers.google.com/maps/documentation/utilities/polylinealgorithm
 */
export function decodePolyline(encoded: string): { latitude: number; longitude: number }[] {
  const points: { latitude: number; longitude: number }[] = [];
  let index = 0;
  const len = encoded.length;
  let lat = 0;
  let lng = 0;

  while (index < len) {
    let b;
    let shift = 0;
    let result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlat = ((result & 1) ? ~(result >> 1) : (result >> 1));
    lat += dlat;

    shift = 0;
    result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlng = ((result & 1) ? ~(result >> 1) : (result >> 1));
    lng += dlng;

    points.push({
      latitude: lat / 1e5,
      longitude: lng / 1e5,
    });
  }

  return points;
}

export interface DirectionsResult {
  points: { latitude: number; longitude: number }[];
  distance: number;
  duration: number;
}

export async function fetchDirections(
  origin: { latitude: number; longitude: number },
  destination: { latitude: number; longitude: number },
  stops: { latitude: number; longitude: number }[],
  apiKey: string
): Promise<DirectionsResult | null> {
  const originStr = `${origin.latitude},${origin.longitude}`;
  const destStr = `${destination.latitude},${destination.longitude}`;
  let url = `https://maps.googleapis.com/maps/api/directions/json?origin=${originStr}&destination=${destStr}&key=${apiKey}`;
  if (stops.length > 0) {
    const waypoints = stops.map(s => `via:${s.latitude},${s.longitude}`).join('|');
    url += `&waypoints=${waypoints}`;
  }

  try {
    const response = await fetch(url);
    const data = await response.json();

    if (data.status === 'OK' && data.routes.length > 0) {
      const route = data.routes[0];
      const encodedPolyline = route.overview_polyline.points;
      
      let totalDistance = 0;
      let totalDuration = 0;
      
      if (route.legs) {
        route.legs.forEach((leg: any) => {
          totalDistance += leg.distance?.value || 0;
          totalDuration += leg.duration?.value || 0;
        });
      }

      return {
        points: decodePolyline(encodedPolyline),
        distance: totalDistance,
        duration: totalDuration,
      };
    } else {
      console.error('Directions API error:', data.status, data.error_message);
      return null;
    }
  } catch (error) {
    console.error('Failed to fetch directions:', error);
    return null;
  }
}
