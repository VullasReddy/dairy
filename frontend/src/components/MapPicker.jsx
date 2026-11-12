import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

const CITY_CENTERS = {
  Narasaraopet: [16.2349, 80.0496], Vijayawada: [16.5062, 80.648], Hyderabad: [17.385, 78.4867], Bengaluru: [12.9716, 77.5946], Chennai: [13.0827, 80.2707],
}
const pinIcon = L.divIcon({ className: 'map-pin', html: '<span></span>', iconSize: [30, 42], iconAnchor: [15, 40] })

/** Map with a draggable pin. Click anywhere or drag the pin to set the exact delivery spot.
 *  OpenStreetMap tiles – free, no API key. */
export default function MapPicker({ lat, lng, city, onChange, height = 260 }) {
  const box = useRef(null)
  const map = useRef(null)
  const marker = useRef(null)
  const cb = useRef(onChange)
  cb.current = onChange

  useEffect(() => {
    const start = lat != null ? [lat, lng] : CITY_CENTERS[city] || [16.2349, 80.0496]
    const m = L.map(box.current, { center: start, zoom: lat != null ? 17 : 12, scrollWheelZoom: false })
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>',
    }).addTo(m)
    const mk = L.marker(start, { draggable: true, icon: pinIcon, keyboard: true, title: 'Delivery location' }).addTo(m)
    const emit = (ll) => cb.current(Math.round(ll.lat * 1e6) / 1e6, Math.round(ll.lng * 1e6) / 1e6)
    mk.on('dragend', () => emit(mk.getLatLng()))
    m.on('click', (e) => { mk.setLatLng(e.latlng); emit(e.latlng) })
    if (lat == null) emit(mk.getLatLng())
    map.current = m; marker.current = mk
    const t = setTimeout(() => m.invalidateSize(), 250)  // sizes correctly inside modals
    return () => { clearTimeout(t); m.remove() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // follow outside changes (e.g. "use my current location")
  useEffect(() => {
    if (!map.current || lat == null) return
    const cur = marker.current.getLatLng()
    if (Math.abs(cur.lat - lat) > 1e-6 || Math.abs(cur.lng - lng) > 1e-6) {
      marker.current.setLatLng([lat, lng]); map.current.setView([lat, lng], 17)
    }
  }, [lat, lng])

  return <div ref={box} className="map-box" style={{ height }} role="application" aria-label="Map – tap to set your delivery location" />
}
