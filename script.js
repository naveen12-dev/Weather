/* =========================================================
   ATMOSYNQ — application logic
   Vanilla JS, async/await, Fetch API, Open-Meteo REST APIs.
   No frameworks, no API keys.
========================================================= */

(() => {
  "use strict";

  /* ---------------------------------------------------------
     Config
  --------------------------------------------------------- */
  const GEOCODE_URL = "https://geocoding-api.open-meteo.com/v1/search";
  const FORECAST_URL = "https://api.open-meteo.com/v1/forecast";
  const REVERSE_GEOCODE_URL = "https://api.bigdatacloud.net/data/reverse-geocode-client";
  const RECENTS_KEY = "atmosynq:recent-cities";
  const MAX_RECENTS = 5;
  const SUGGEST_DEBOUNCE_MS = 320;
  const MIN_QUERY_LENGTH = 2;

  /* ---------------------------------------------------------
     DOM references
  --------------------------------------------------------- */
  const dom = {
    atmosphere: document.getElementById("atmosphere"),
    particles: document.getElementById("particles"),

    deviceDate: document.getElementById("deviceDate"),
    deviceTime: document.getElementById("deviceTime"),

    cityInput: document.getElementById("cityInput"),
    clearBtn: document.getElementById("clearBtn"),
    searchBtn: document.getElementById("searchBtn"),
    locationBtn: document.getElementById("locationBtn"),
    suggestionsList: document.getElementById("suggestionsList"),

    recentWrap: document.getElementById("recentWrap"),
    recentChips: document.getElementById("recentChips"),

    emptyState: document.getElementById("emptyState"),
    loadingState: document.getElementById("loadingState"),
    errorState: document.getElementById("errorState"),
    errorTitle: document.getElementById("errorTitle"),
    errorMessage: document.getElementById("errorMessage"),
    retryBtn: document.getElementById("retryBtn"),
    weatherContent: document.getElementById("weatherContent"),

    cityName: document.getElementById("cityName"),
    countryName: document.getElementById("countryName"),
    dayNightBadge: document.getElementById("dayNightBadge"),
    dayNightLabel: document.getElementById("dayNightLabel"),
    weatherIcon: document.getElementById("weatherIcon"),
    tempValue: document.getElementById("tempValue"),
    conditionLabel: document.getElementById("conditionLabel"),
    feelsLikeInline: document.getElementById("feelsLikeInline"),
    lastUpdated: document.getElementById("lastUpdated"),
    localTime: document.getElementById("localTime"),

    humidityValue: document.getElementById("humidityValue"),
    windSpeedValue: document.getElementById("windSpeedValue"),
    windDirValue: document.getElementById("windDirValue"),
    compassNeedle: document.getElementById("compassNeedle"),
    feelsLikeValue: document.getElementById("feelsLikeValue"),
    uvValue: document.getElementById("uvValue"),
  };

  /* ---------------------------------------------------------
     State
  --------------------------------------------------------- */
  const state = {
    suggestions: [],
    activeSuggestionIndex: -1,
    lastRequestKey: null,
    lastSelectedCity: null, // { name, country, latitude, longitude, timezone? }
    weatherAbortController: null,
    geocodeAbortController: null,
    debounceHandle: null,
  };

  /* ---------------------------------------------------------
     WMO weather-code lookup
     group drives the atmosphere theme + particle system
  --------------------------------------------------------- */
  const WEATHER_CODES = {
    0:  { label: "Clear sky",            group: "clear" },
    1:  { label: "Mostly clear",         group: "clear" },
    2:  { label: "Partly cloudy",        group: "cloudy" },
    3:  { label: "Overcast",             group: "cloudy" },
    45: { label: "Fog",                  group: "fog" },
    48: { label: "Rime fog",             group: "fog" },
    51: { label: "Light drizzle",        group: "rain" },
    53: { label: "Drizzle",              group: "rain" },
    55: { label: "Dense drizzle",        group: "rain" },
    56: { label: "Freezing drizzle",     group: "rain" },
    57: { label: "Freezing drizzle",     group: "rain" },
    61: { label: "Light rain",           group: "rain" },
    63: { label: "Rain",                 group: "rain" },
    65: { label: "Heavy rain",           group: "rain" },
    66: { label: "Freezing rain",        group: "rain" },
    67: { label: "Freezing rain",        group: "rain" },
    71: { label: "Light snow",           group: "snow" },
    73: { label: "Snow",                 group: "snow" },
    75: { label: "Heavy snow",           group: "snow" },
    77: { label: "Snow grains",          group: "snow" },
    80: { label: "Light showers",        group: "rain" },
    81: { label: "Showers",              group: "rain" },
    82: { label: "Violent showers",      group: "rain" },
    85: { label: "Snow showers",         group: "snow" },
    86: { label: "Heavy snow showers",   group: "snow" },
    95: { label: "Thunderstorm",         group: "storm" },
    96: { label: "Thunderstorm, hail",   group: "storm" },
    99: { label: "Thunderstorm, hail",   group: "storm" },
  };

  function resolveWeather(code){
    return WEATHER_CODES[code] || { label: "Unknown", group: "cloudy" };
  }

  /* ---------------------------------------------------------
     Line-art icon set (currentColor driven, no emoji)
  --------------------------------------------------------- */
  const ICONS = {
    sun: `<svg viewBox="0 0 64 64" fill="none"><circle cx="32" cy="32" r="13" stroke="currentColor" stroke-width="2"/>
      <g stroke="currentColor" stroke-width="2" stroke-linecap="round">
        <line x1="32" y1="4" x2="32" y2="12"/><line x1="32" y1="52" x2="32" y2="60"/>
        <line x1="4" y1="32" x2="12" y2="32"/><line x1="52" y1="32" x2="60" y2="32"/>
        <line x1="11.5" y1="11.5" x2="17" y2="17"/><line x1="47" y1="47" x2="52.5" y2="52.5"/>
        <line x1="11.5" y1="52.5" x2="17" y2="47"/><line x1="47" y1="17" x2="52.5" y2="11.5"/>
      </g></svg>`,
    moon: `<svg viewBox="0 0 64 64" fill="none"><path d="M42 8 A22 22 0 1 0 56 34 A17 17 0 0 1 42 8 Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>`,
    cloudSun: `<svg viewBox="0 0 64 64" fill="none">
      <circle cx="22" cy="22" r="9" stroke="currentColor" stroke-width="2" opacity="0.85"/>
      <g stroke="currentColor" stroke-width="2" stroke-linecap="round" opacity="0.85"><line x1="22" y1="4" x2="22" y2="8"/><line x1="6.5" y1="12.5" x2="9.5" y2="15.5"/><line x1="37.5" y1="12.5" x2="34.5" y2="15.5"/></g>
      <path d="M18 42 h28 a9 9 0 0 0 1-17.9 A12.5 12.5 0 0 0 22.5 30" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
    </svg>`,
    cloudMoon: `<svg viewBox="0 0 64 64" fill="none">
      <path d="M30 6 A14 14 0 1 0 40 22 A11 11 0 0 1 30 6 Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round" opacity="0.85"/>
      <path d="M14 46 h30 a9.5 9.5 0 0 0 1-19 A13 13 0 0 0 18 33" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
    </svg>`,
    cloud: `<svg viewBox="0 0 64 64" fill="none"><path d="M14 44 h34 a10 10 0 0 0 1-19.9 A14 14 0 0 0 19 30" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>`,
    rain: `<svg viewBox="0 0 64 64" fill="none">
      <path d="M14 34 h34 a10 10 0 0 0 1-19.9 A14 14 0 0 0 19 20" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
      <g stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="22" y1="46" x2="18" y2="56"/><line x1="34" y1="46" x2="30" y2="56"/><line x1="46" y1="46" x2="42" y2="56"/></g>
    </svg>`,
    snow: `<svg viewBox="0 0 64 64" fill="none">
      <path d="M14 32 h34 a10 10 0 0 0 1-19.9 A14 14 0 0 0 19 18" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
      <g stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="22" y1="44" x2="22" y2="56"/><line x1="16.5" y1="47" x2="27.5" y2="53"/><line x1="27.5" y1="47" x2="16.5" y2="53"/>
      <line x1="44" y1="44" x2="44" y2="56"/><line x1="38.5" y1="47" x2="49.5" y2="53"/><line x1="49.5" y1="47" x2="38.5" y2="53"/></g>
    </svg>`,
    storm: `<svg viewBox="0 0 64 64" fill="none">
      <path d="M14 30 h34 a10 10 0 0 0 1-19.9 A14 14 0 0 0 19 16" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
      <path d="M33 40 L24 52 h9 l-4 12 15 -16 h-9 z" stroke="currentColor" stroke-width="2" stroke-linejoin="round" fill="currentColor" fill-opacity="0.15"/>
    </svg>`,
    fog: `<svg viewBox="0 0 64 64" fill="none">
      <path d="M18 24 h28 a9 9 0 0 0 1-17.9" stroke="currentColor" stroke-width="2" stroke-linecap="round" opacity="0.75"/>
      <g stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="10" y1="34" x2="54" y2="34"/><line x1="16" y1="42" x2="48" y2="42"/><line x1="10" y1="50" x2="54" y2="50"/></g>
    </svg>`,
  };

  function iconFor(group, isDay){
    switch(group){
      case "clear": return isDay ? ICONS.sun : ICONS.moon;
      case "cloudy": return isDay ? ICONS.cloudSun : ICONS.cloudMoon;
      case "rain": return ICONS.rain;
      case "snow": return ICONS.snow;
      case "storm": return ICONS.storm;
      case "fog": return ICONS.fog;
      default: return ICONS.cloud;
    }
  }

  function themeFor(group, isDay){
    if (group === "clear") return isDay ? "theme-clear-day" : "theme-clear-night";
    if (group === "cloudy") return isDay ? "theme-cloudy-day" : "theme-cloudy-night";
    if (group === "rain") return "theme-rain";
    if (group === "snow") return "theme-snow";
    if (group === "storm") return "theme-storm";
    if (group === "fog") return "theme-fog";
    return "theme-cloudy-day";
  }

  /* ---------------------------------------------------------
     Small utilities
  --------------------------------------------------------- */
  function debounce(fn, delay){
    let handle;
    return (...args) => {
      clearTimeout(handle);
      handle = setTimeout(() => fn(...args), delay);
    };
  }

  function escapeHtml(str){
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  function sanitizeQuery(raw){
    // Strip anything that isn't a letter, space, apostrophe, hyphen or period.
    return raw.replace(/[^\p{L}\p{M}\s'.\-]/gu, "").trim();
  }

  function degreesToCardinal(deg){
    const dirs = ["N","NNE","NE","ENE","E","ESE","SE","SSE","S","SSW","SW","WSW","W","WNW","NW","NNW"];
    const idx = Math.round(deg / 22.5) % 16;
    return dirs[idx];
  }

  function formatClockTime(date){
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  }

  function formatShortTime(date){
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  /* ---------------------------------------------------------
     Header clock (device time) — ticks every second
  --------------------------------------------------------- */
  function tickClock(){
    const now = new Date();
    dom.deviceDate.textContent = now.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" });
    dom.deviceTime.textContent = formatClockTime(now);
  }
  tickClock();
  setInterval(tickClock, 1000);

  /* ---------------------------------------------------------
     UI state machine: empty / loading / error / content
  --------------------------------------------------------- */
  function showState(name){
    dom.emptyState.hidden = name !== "empty";
    dom.loadingState.hidden = name !== "loading";
    dom.errorState.hidden = name !== "error";
    dom.weatherContent.hidden = name !== "content";
    dom.loadingState.setAttribute("aria-busy", String(name === "loading"));
  }

  function showError(title, message){
    dom.errorTitle.textContent = title;
    dom.errorMessage.textContent = message;
    showState("error");
  }

  /* ---------------------------------------------------------
     Particle system (rain / snow) — lightweight CSS-driven
  --------------------------------------------------------- */
  function renderParticles(group){
    dom.particles.innerHTML = "";
    if (group !== "rain" && group !== "snow") return;

    const count = group === "rain" ? 70 : 45;
    const fragment = document.createDocumentFragment();

    for (let i = 0; i < count; i++){
      const p = document.createElement("div");
      const left = Math.random() * 100;
      const duration = group === "rain" ? (0.5 + Math.random() * 0.4) : (4 + Math.random() * 4);
      const delay = Math.random() * 4;

      if (group === "rain"){
        p.className = "particle particle--rain";
        p.style.left = left + "vw";
        p.style.animationDuration = duration + "s";
        p.style.animationDelay = delay + "s";
        p.style.opacity = String(0.35 + Math.random() * 0.4);
      } else {
        p.className = "particle particle--snow";
        p.style.left = left + "vw";
        p.style.setProperty("--drift", (Math.random() * 60 - 30) + "px");
        p.style.animationDuration = duration + "s";
        p.style.animationDelay = delay + "s";
        p.style.opacity = String(0.4 + Math.random() * 0.5);
        const scale = 0.6 + Math.random() * 0.8;
        p.style.transform = `scale(${scale})`;
      }
      fragment.appendChild(p);
    }
    dom.particles.appendChild(fragment);
  }

  /* ---------------------------------------------------------
     Recent searches (localStorage)
  --------------------------------------------------------- */
  function loadRecents(){
    try {
      const raw = localStorage.getItem(RECENTS_KEY);
      const list = raw ? JSON.parse(raw) : [];
      return Array.isArray(list) ? list : [];
    } catch {
      return [];
    }
  }

  function saveRecent(city){
    let list = loadRecents();
    list = list.filter(c => !(c.name === city.name && c.country === city.country));
    list.unshift(city);
    list = list.slice(0, MAX_RECENTS);
    try { localStorage.setItem(RECENTS_KEY, JSON.stringify(list)); } catch { /* storage unavailable — ignore */ }
    renderRecents();
  }

  function renderRecents(){
    const list = loadRecents();
    dom.recentChips.innerHTML = "";
    if (!list.length){
      dom.recentWrap.hidden = true;
      return;
    }
    dom.recentWrap.hidden = false;
    list.forEach(city => {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "chip";
      chip.textContent = `${city.name}, ${city.country}`;
      chip.addEventListener("click", () => selectCity(city));
      dom.recentChips.appendChild(chip);
    });
  }

  /* ---------------------------------------------------------
     Geocoding — suggestions as the user types
  --------------------------------------------------------- */
  const requestSuggestions = debounce(async (query) => {
    if (state.geocodeAbortController) state.geocodeAbortController.abort();
    const controller = new AbortController();
    state.geocodeAbortController = controller;

    try {
      const url = `${GEOCODE_URL}?name=${encodeURIComponent(query)}&count=6&language=en&format=json`;
      const res = await fetch(url, { signal: controller.signal });
      if (!res.ok) throw new Error("geocode-http-error");

      const data = await res.json();
      const results = Array.isArray(data.results) ? data.results : [];
      state.suggestions = results.map(r => ({
        name: r.name,
        country: r.country || "",
        admin1: r.admin1 || "",
        latitude: r.latitude,
        longitude: r.longitude,
        timezone: r.timezone,
      }));
      renderSuggestions(query);
    } catch (err){
      if (err.name === "AbortError") return;
      // Suggestions are a convenience feature — fail silently rather than
      // interrupting the user with an error for a background lookup.
      state.suggestions = [];
      renderSuggestions(query);
    }
  }, SUGGEST_DEBOUNCE_MS);

  function renderSuggestions(query){
    const list = dom.suggestionsList;
    list.innerHTML = "";
    state.activeSuggestionIndex = -1;

    if (!state.suggestions.length){
      const li = document.createElement("li");
      li.className = "suggestions__empty";
      li.textContent = `No cities found for "${query}"`;
      list.appendChild(li);
      list.hidden = false;
      dom.cityInput.setAttribute("aria-expanded", "true");
      return;
    }

    state.suggestions.forEach((city, index) => {
      const li = document.createElement("li");
      li.role = "option";
      li.id = `suggestion-${index}`;
      li.tabIndex = -1;

      const nameEl = document.createElement("span");
      nameEl.className = "s-name";
      nameEl.innerHTML = highlightMatch(city.name, query);

      const metaEl = document.createElement("span");
      metaEl.className = "s-meta";
      metaEl.textContent = [city.admin1, city.country].filter(Boolean).join(" · ");

      li.appendChild(nameEl);
      li.appendChild(metaEl);
      li.addEventListener("click", () => selectCity(city));
      list.appendChild(li);
    });

    list.hidden = false;
    dom.cityInput.setAttribute("aria-expanded", "true");
  }

  function highlightMatch(name, query){
    const safeName = escapeHtml(name);
    const q = query.trim();
    if (!q) return safeName;
    const idx = safeName.toLowerCase().indexOf(q.toLowerCase());
    if (idx === -1) return safeName;
    return safeName.slice(0, idx) + "<b>" + safeName.slice(idx, idx + q.length) + "</b>" + safeName.slice(idx + q.length);
  }

  function closeSuggestions(){
    dom.suggestionsList.hidden = true;
    dom.suggestionsList.innerHTML = "";
    dom.cityInput.setAttribute("aria-expanded", "false");
    state.activeSuggestionIndex = -1;
  }

  /* ---------------------------------------------------------
     Forecast fetch + render
  --------------------------------------------------------- */
  async function fetchAndRenderWeather(city){
    const requestKey = `${city.latitude.toFixed(3)},${city.longitude.toFixed(3)}`;

    // Prevent redundant duplicate requests: skip re-fetching coordinates
    // that are already displayed successfully on screen.
    if (requestKey === state.lastRequestKey && !dom.weatherContent.hidden) {
      return;
    }
    state.lastRequestKey = requestKey;
    state.lastSelectedCity = city;

    if (state.weatherAbortController) state.weatherAbortController.abort();
    const controller = new AbortController();
    state.weatherAbortController = controller;

    showState("loading");

    try {
      const params = new URLSearchParams({
        latitude: city.latitude,
        longitude: city.longitude,
        current: "temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,wind_direction_10m,is_day",
        daily: "uv_index_max",
        timezone: "auto",
      });
      const url = `${FORECAST_URL}?${params.toString()}`;

      const res = await fetch(url, { signal: controller.signal });
      if (!res.ok){
        throw new HttpError(res.status);
      }

      let data;
      try {
        data = await res.json();
      } catch {
        throw new Error("invalid-json");
      }

      if (!data || !data.current){
        throw new Error("invalid-payload");
      }

      renderWeather(city, data);
      saveRecent({
        name: city.name,
        country: city.country,
        latitude: city.latitude,
        longitude: city.longitude,
        timezone: data.timezone || city.timezone || "",
      });
      showState("content");

    } catch (err){
      if (err.name === "AbortError") return; // superseded by a newer request

      if (!navigator.onLine){
        showError("You're offline", "Check your internet connection and try again.");
      } else if (err instanceof HttpError){
        showError("Weather service unavailable", `The forecast API returned an error (status ${err.status}). Please try again shortly.`);
      } else if (err.message === "invalid-json" || err.message === "invalid-payload"){
        showError("Unexpected response", "The weather service returned data we couldn't understand. Please try again.");
      } else {
        showError("Network error", "We couldn't reach the weather service. Check your connection and try again.");
      }
    }
  }

  class HttpError extends Error {
    constructor(status){
      super("http-error");
      this.status = status;
    }
  }

  function renderWeather(city, data){
    const current = data.current;
    const isDay = current.is_day === 1;
    const { label, group } = resolveWeather(current.weather_code);

    dom.cityName.textContent = city.name;
    dom.countryName.textContent = [city.admin1, city.country].filter(Boolean).join(", ");

    dom.dayNightLabel.textContent = isDay ? "Day" : "Night";
    dom.dayNightBadge.classList.toggle("is-night", !isDay);

    dom.weatherIcon.innerHTML = iconFor(group, isDay);
    dom.tempValue.textContent = Math.round(current.temperature_2m);
    dom.conditionLabel.textContent = label;
    dom.feelsLikeInline.textContent = `Feels like ${Math.round(current.apparent_temperature)}°`;

    dom.humidityValue.textContent = Math.round(current.relative_humidity_2m);
    dom.windSpeedValue.textContent = Math.round(current.wind_speed_10m);
    dom.windDirValue.textContent = `${degreesToCardinal(current.wind_direction_10m)} · ${Math.round(current.wind_direction_10m)}°`;
    dom.compassNeedle.style.transform = `rotate(${current.wind_direction_10m}deg)`;
    dom.feelsLikeValue.textContent = Math.round(current.apparent_temperature);

    const uv = data.daily && Array.isArray(data.daily.uv_index_max) ? data.daily.uv_index_max[0] : null;
    dom.uvValue.textContent = (uv === null || uv === undefined) ? "N/A" : uv.toFixed(1);

    const now = new Date();
    dom.lastUpdated.textContent = formatShortTime(now);

    if (data.timezone){
      try {
        dom.localTime.textContent = new Date().toLocaleTimeString("en-GB", {
          hour: "2-digit", minute: "2-digit", timeZone: data.timezone,
        });
      } catch {
        dom.localTime.textContent = "—";
      }
    } else {
      dom.localTime.textContent = "—";
    }

    const theme = themeFor(group, isDay);
    dom.atmosphere.className = `atmosphere ${theme}`;
    renderParticles(group);
  }

  /* ---------------------------------------------------------
     Selecting a city (from suggestions, recents, or geolocation)
  --------------------------------------------------------- */
  function selectCity(city){
    dom.cityInput.value = `${city.name}${city.country ? ", " + city.country : ""}`;
    closeSuggestions();
    dom.clearBtn.hidden = dom.cityInput.value.length === 0;
    fetchAndRenderWeather(city);
  }

  /* ---------------------------------------------------------
     Manual search (Enter key / Search button)
     Resolves the typed text to a place via the geocoding API,
     then loads its weather.
  --------------------------------------------------------- */
  async function performSearch(){
    const raw = dom.cityInput.value;
    const query = sanitizeQuery(raw);

    if (!query){
      showError("Enter a city", "Type a city name to search — the field can't be empty.");
      return;
    }
    if (query.length < MIN_QUERY_LENGTH){
      showError("City name too short", "Please enter at least two characters.");
      return;
    }

    closeSuggestions();
    showState("loading");

    try {
      const url = `${GEOCODE_URL}?name=${encodeURIComponent(query)}&count=1&language=en&format=json`;
      const res = await fetch(url);
      if (!res.ok) throw new HttpError(res.status);

      const data = await res.json();
      const results = Array.isArray(data.results) ? data.results : [];

      if (!results.length){
        showError("City not found", `We couldn't find "${query}". Check the spelling and try again.`);
        return;
      }

      const top = results[0];
      selectCity({
        name: top.name,
        country: top.country || "",
        admin1: top.admin1 || "",
        latitude: top.latitude,
        longitude: top.longitude,
        timezone: top.timezone,
      });

    } catch (err){
      if (!navigator.onLine){
        showError("You're offline", "Check your internet connection and try again.");
      } else if (err instanceof HttpError){
        showError("Search unavailable", `The location service returned an error (status ${err.status}).`);
      } else {
        showError("Network error", "We couldn't reach the location service. Please try again.");
      }
    }
  }

  /* ---------------------------------------------------------
     Geolocation — "Use my location"
  --------------------------------------------------------- */
  function useMyLocation(){
    if (!("geolocation" in navigator)){
      showError("Location unavailable", "Your browser doesn't support geolocation.");
      return;
    }

    showState("loading");

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        let name = "Your location";
        let country = "";
        let admin1 = "";

        try {
          const url = `${REVERSE_GEOCODE_URL}?latitude=${latitude}&longitude=${longitude}&localityLanguage=en`;
          const res = await fetch(url);
          if (res.ok){
            const place = await res.json();
            name = place.city || place.locality || place.principalSubdivision || "Your location";
            country = place.countryName || "";
            admin1 = place.principalSubdivision || "";
          }
        } catch {
          // Reverse geocoding is a nicety — fall back to generic labelling.
        }

        selectCity({ name, country, admin1, latitude, longitude });
      },
      (error) => {
        if (error.code === error.PERMISSION_DENIED){
          showError("Location permission denied", "Allow location access in your browser settings, or search for a city instead.");
        } else if (error.code === error.TIMEOUT){
          showError("Location request timed out", "We couldn't get your location in time. Please try again.");
        } else {
          showError("Location unavailable", "We couldn't determine your location. Please search for a city instead.");
        }
      },
      { timeout: 10000, maximumAge: 5 * 60 * 1000 }
    );
  }

  /* ---------------------------------------------------------
     Event wiring
  --------------------------------------------------------- */
  dom.cityInput.addEventListener("input", () => {
    const raw = dom.cityInput.value;
    dom.clearBtn.hidden = raw.length === 0;

    const query = sanitizeQuery(raw);
    if (query.length < MIN_QUERY_LENGTH){
      closeSuggestions();
      return;
    }
    requestSuggestions(query);
  });

  dom.cityInput.addEventListener("keydown", (e) => {
    const items = Array.from(dom.suggestionsList.querySelectorAll("li[role='option']"));

    if (e.key === "ArrowDown" && items.length){
      e.preventDefault();
      state.activeSuggestionIndex = (state.activeSuggestionIndex + 1) % items.length;
      items.forEach(li => li.classList.remove("is-active"));
      items[state.activeSuggestionIndex].classList.add("is-active");
      items[state.activeSuggestionIndex].scrollIntoView({ block: "nearest" });
    } else if (e.key === "ArrowUp" && items.length){
      e.preventDefault();
      state.activeSuggestionIndex = (state.activeSuggestionIndex - 1 + items.length) % items.length;
      items.forEach(li => li.classList.remove("is-active"));
      items[state.activeSuggestionIndex].classList.add("is-active");
      items[state.activeSuggestionIndex].scrollIntoView({ block: "nearest" });
    } else if (e.key === "Enter"){
      e.preventDefault();
      if (state.activeSuggestionIndex >= 0 && state.suggestions[state.activeSuggestionIndex]){
        selectCity(state.suggestions[state.activeSuggestionIndex]);
      } else {
        performSearch();
      }
    } else if (e.key === "Escape"){
      closeSuggestions();
    }
  });

  dom.clearBtn.addEventListener("click", () => {
    dom.cityInput.value = "";
    dom.clearBtn.hidden = true;
    closeSuggestions();
    dom.cityInput.focus();
  });

  dom.searchBtn.addEventListener("click", performSearch);
  dom.locationBtn.addEventListener("click", useMyLocation);
  dom.retryBtn.addEventListener("click", () => {
    if (state.lastSelectedCity){
      state.lastRequestKey = null; // force a retry even for the same coordinates
      fetchAndRenderWeather(state.lastSelectedCity);
    } else {
      showState("empty");
    }
  });

  document.addEventListener("click", (e) => {
    if (!e.target.closest(".search-panel")){
      closeSuggestions();
    }
  });

  /* ---------------------------------------------------------
     Init
  --------------------------------------------------------- */
  renderRecents();
  showState("empty");
})();
