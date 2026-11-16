/**
 * Built-in basemap presets: a tile source, the attribution it requires, and
 * optionally a relief overlay and a color fade, picked by name with the
 * `basemap` option. Every preset here works without an API key.
 */

/** A second tile layer composited onto each base tile before the route is drawn (e.g. hillshade). */
export interface OverlayLayer {
  /** XYZ tile URL template, same tokens as `tileUrl`. */
  tileUrl: string;
  /** 0-1, how strongly the overlay shows. Defaults to `1`. */
  opacity?: number;
  /**
   * `"normal"` (default) alpha-blends the overlay on top, for transparent
   * overlays such as trails or labels. `"multiply"` darkens the base map by
   * the overlay's brightness, for grayscale hillshade: white leaves the map
   * unchanged, shadows darken it.
   */
  blend?: "normal" | "multiply";
  /**
   * Highest zoom the overlay source serves. Above it, the overlay tile at
   * this zoom is cropped and smoothly upscaled, so relief stays visible on
   * short, zoomed-in routes.
   */
  maxZoom?: number;
}

export interface Basemap {
  tileUrl: string;
  attribution: string;
  /** Highest zoom the tile source serves; the route is framed no closer than this. */
  maxZoom?: number;
  overlay?: OverlayLayer;
  /** 0-1, softens the base tiles' colors (see `RenderRouteOptions.tileFade`). */
  tileFade?: number;
}

const ESRI = "https://server.arcgisonline.com/ArcGIS/rest/services";
const ESRI_TOPO_ATTRIBUTION = "Esri, HERE, Garmin, FAO, USGS, © OpenStreetMap contributors";
const ESRI_HILLSHADE: OverlayLayer = {
  tileUrl: `${ESRI}/Elevation/World_Hillshade/MapServer/tile/{z}/{y}/{x}`,
  blend: "multiply",
  opacity: 0.45,
  maxZoom: 16,
};

const IGN_WMTS =
  "https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}";
const IGN_PLAN = `${IGN_WMTS}&LAYER=GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2&STYLE=normal&TILEMATRIXSET=PM&FORMAT=image/png`;
const IGN_ATTRIBUTION = "© IGN - Plan IGN";
const IGN_HILLSHADE: OverlayLayer = {
  tileUrl: `${IGN_WMTS}&LAYER=ELEVATION.ELEVATIONGRIDCOVERAGE.SHADOW&STYLE=estompage_grayscale&TILEMATRIXSET=PM_0_15&FORMAT=image/png`,
  blend: "multiply",
  opacity: 0.5,
  maxZoom: 15,
};

export const BASEMAPS = {
  /** OpenStreetMap's standard style — gpxsnap's default. */
  osm: {
    tileUrl: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution: "© OpenStreetMap contributors",
    maxZoom: 19,
  },
  /** Esri World Topographic Map: muted pastel colors, light relief, discreet roads. JPEG tiles, so Bun only. */
  "esri-topo": {
    tileUrl: `${ESRI}/World_Topo_Map/MapServer/tile/{z}/{y}/{x}`,
    attribution: ESRI_TOPO_ATTRIBUTION,
    maxZoom: 19,
  },
  /** `esri-topo` with a stronger hillshade and slightly softened colors. */
  "esri-topo-relief": {
    tileUrl: `${ESRI}/World_Topo_Map/MapServer/tile/{z}/{y}/{x}`,
    attribution: ESRI_TOPO_ATTRIBUTION,
    maxZoom: 19,
    overlay: ESRI_HILLSHADE,
    tileFade: 0.3,
  },
  /** Esri Light Gray Canvas: minimal gray map with no labels, so the route stands out. JPEG tiles, so Bun only. */
  "esri-light-gray": {
    tileUrl: `${ESRI}/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}`,
    attribution: "Esri, HERE, Garmin, © OpenStreetMap contributors",
    maxZoom: 16,
  },
  /** IGN's Plan IGN (France only, open licence). */
  "ign-plan": {
    tileUrl: IGN_PLAN,
    attribution: IGN_ATTRIBUTION,
    maxZoom: 19,
  },
  /** Plan IGN with IGN's hillshade and softened colors (France only). */
  "ign-plan-relief": {
    tileUrl: IGN_PLAN,
    attribution: IGN_ATTRIBUTION,
    maxZoom: 19,
    overlay: IGN_HILLSHADE,
    tileFade: 0.5,
  },
} as const satisfies Record<string, Basemap>;

export type BasemapName = keyof typeof BASEMAPS;

export const BASEMAP_NAMES = Object.keys(BASEMAPS) as BasemapName[];

export function resolveBasemap(name: string): Basemap {
  if (!Object.hasOwn(BASEMAPS, name)) {
    throw new Error(`unknown basemap "${name}" (expected ${BASEMAP_NAMES.join(", ")})`);
  }
  return BASEMAPS[name as BasemapName];
}
