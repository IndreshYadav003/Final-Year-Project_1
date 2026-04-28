let currentStep = 0;
let toastTimer;

const appConfig = window.WANDERLUST_CONFIG || {};
const GOOGLE_MAPS_API_KEY = (appConfig.googleMapsApiKey || "").trim();

let googleMapsAutocompleteReady = false;
let googleMapsApiRequested = false;

const countryStateData = [
  { name: "India", states: ["Goa", "Delhi", "Kerala", "Rajasthan", "Maharashtra", "Uttar Pradesh", "Karnataka", "Tamil Nadu", "Himachal Pradesh", "Jammu and Kashmir"] },
  { name: "United States", states: ["California", "New York", "Florida", "Texas", "Nevada", "Hawaii"] },
  { name: "Japan", states: ["Tokyo", "Kyoto", "Osaka", "Hokkaido", "Okinawa"] },
  { name: "France", states: ["Ile-de-France", "Provence-Alpes-Cote d'Azur", "Normandy", "Auvergne-Rhone-Alpes"] },
  { name: "Italy", states: ["Lazio", "Tuscany", "Veneto", "Lombardy", "Campania"] },
  { name: "Indonesia", states: ["Bali", "Jakarta", "West Java", "Yogyakarta"] },
  { name: "Thailand", states: ["Bangkok", "Phuket", "Chiang Mai", "Krabi"] },
  { name: "United Kingdom", states: ["England", "Scotland", "Wales", "Northern Ireland"] },
  { name: "Australia", states: ["New South Wales", "Victoria", "Queensland", "Western Australia"] },
  { name: "United Arab Emirates", states: ["Dubai", "Abu Dhabi", "Sharjah"] }
];

const defaultItineraryData = {
  destinationLabel: "GOA, INDIA - DEC 2026",
  title: "5 Days in Goa",
  shareMessage: "Trip link copied to clipboard!",
  destinationMapUrl: "https://www.google.com/maps/search/?api=1&query=Goa%2C%20India",
  departureMapUrl: "https://www.google.com/maps/search/?api=1&query=Lucknow",
  routeLabel: "Lucknow to Goa, India",
  badges: ["Dates Dec 20 - 24", "2 Travellers", "INR 39,500 est.", "28C avg"],
  days: [
    {
      title: "Day 1 - Arrival & South Goa",
      date: "Sunday, 20 December 2026",
      open: true,
      items: [
        {
          time: "09:00 AM",
          title: "Arrive in Goa",
          desc: "Transfer from the airport and settle into your stay.",
          chipClass: "chip-travel",
          chipLabel: "Travel"
        },
        {
          time: "04:30 PM",
          title: "Sunset walk",
          desc: "Start easy with a relaxed beach walk and dinner nearby.",
          chipClass: "chip-sight",
          chipLabel: "Sightseeing"
        }
      ]
    }
  ],
  costBreakdown: [
    ["Travel", "INR 7,000"],
    ["Stay", "INR 14,000"],
    ["Food & Dining", "INR 7,500"],
    ["Activities", "INR 8,000"],
    ["Miscellaneous", "INR 3,000"],
    ["Total Estimate", "INR 39,500", true]
  ],
  weather: [
    ["Sunny", "29C", "Dec 20"],
    ["Cloudy", "28C", "Dec 21"],
    ["Sunny", "30C", "Dec 22"]
  ],
  tips: [
    "Save an offline Google Maps area before departure.",
    "Keep some budget aside for entry tickets and local transfers.",
    "Adjust outdoor plans based on local weather and opening hours."
  ]
};

let itineraryData = JSON.parse(JSON.stringify(defaultItineraryData));

function buildGoogleMapsSearchUrl(query) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

function buildActivityMapUrl(activityTitle, destination) {
  return buildGoogleMapsSearchUrl(`${activityTitle}, ${destination}`);
}

function setDestinationHelp(message) {
  const helper = document.getElementById("destination-help");
  if (helper) helper.textContent = message;
}

function populateCountryOptions(selectedCountry = "India") {
  const countrySelect = document.getElementById("country-input");
  if (!countrySelect) return;

  countrySelect.innerHTML = "";

  countryStateData.forEach((country) => {
    const option = document.createElement("option");
    option.value = country.name;
    option.textContent = country.name;
    option.selected = country.name === selectedCountry;
    countrySelect.appendChild(option);
  });
}

function populateStateOptions(countryName, selectedState = "") {
  const stateSelect = document.getElementById("state-input");
  if (!stateSelect) return;

  stateSelect.innerHTML = "";
  const countryEntry = countryStateData.find((country) => country.name === countryName) || countryStateData[0];
  const states = countryEntry?.states || [];
  const resolvedState = selectedState || states[0] || "";

  states.forEach((state) => {
    const option = document.createElement("option");
    option.value = state;
    option.textContent = state;
    option.selected = state === resolvedState;
    stateSelect.appendChild(option);
  });
}

function syncDestinationFromSelectors() {
  const country = document.getElementById("country-input")?.value || "";
  const state = document.getElementById("state-input")?.value || "";
  const destinationInput = document.getElementById("destination-input");
  if (!destinationInput || !country || !state) return;

  const destinationLabel = `${state}, ${country}`;
  destinationInput.value = destinationLabel;
  destinationInput.dataset.placeLabel = destinationLabel;
  destinationInput.dataset.placeLocality = state;
  destinationInput.dataset.placeRegion = state;
  destinationInput.dataset.placeCountry = country;
  destinationInput.dataset.placeAddress = destinationLabel;
}

function handleCountryChange() {
  const country = document.getElementById("country-input")?.value || "India";
  populateStateOptions(country);
  syncDestinationFromSelectors();
}

function handleStateChange() {
  syncDestinationFromSelectors();
}

function loadGoogleMapsApi() {
  if (googleMapsApiRequested || googleMapsAutocompleteReady || !GOOGLE_MAPS_API_KEY) {
    return;
  }

  googleMapsApiRequested = true;
  window.initGoogleMapsPlaces = initGoogleMapsPlaces;

  const script = document.createElement("script");
  script.src =
    `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(GOOGLE_MAPS_API_KEY)}` +
    "&libraries=places&loading=async&callback=initGoogleMapsPlaces";
  script.async = true;
  script.defer = true;
  script.onerror = () => {
    setDestinationHelp("Google Maps could not be loaded. You can still type destinations manually.");
    showToast("Google Maps could not be loaded.");
  };
  document.head.appendChild(script);
}

function extractPlacePart(place, desiredTypes) {
  const components = place?.address_components;
  if (!Array.isArray(components)) return "";

  const match = components.find((component) =>
    desiredTypes.some((type) => component.types?.includes(type))
  );

  return match?.long_name || "";
}

function storePlaceMetadata(input, place) {
  if (!input || !place) return;

  const locality =
    extractPlacePart(place, ["locality", "administrative_area_level_2"]) ||
    place.name ||
    "";
  const region = extractPlacePart(place, ["administrative_area_level_1"]) || locality;
  const country = extractPlacePart(place, ["country"]) || "";
  const formattedAddress = place.formatted_address || input.value.trim();
  const label = place.name && country ? `${place.name}, ${country}` : formattedAddress;

  input.dataset.placeLabel = label;
  input.dataset.placeLocality = locality;
  input.dataset.placeRegion = region;
  input.dataset.placeCountry = country;
  input.dataset.placeAddress = formattedAddress;

  if (input.id === "destination-input") {
    const countryInput = document.getElementById("country-input");
    const stateInput = document.getElementById("state-input");
    if (countryInput && country) {
      const hasCountry = countryStateData.some((entry) => entry.name === country);
      if (hasCountry) {
        populateCountryOptions(country);
        populateStateOptions(country, region);
      } else {
        countryInput.value = country;
      }
    }
    if (stateInput && region) stateInput.value = region;
  }
}

function clearPlaceMetadata(input) {
  if (!input) return;

  delete input.dataset.placeLabel;
  delete input.dataset.placeLocality;
  delete input.dataset.placeRegion;
  delete input.dataset.placeCountry;
  delete input.dataset.placeAddress;
}

function attachAutocomplete(inputId) {
  const input = document.getElementById(inputId);
  if (!input || !window.google?.maps?.places?.Autocomplete) return;

  const autocomplete = new google.maps.places.Autocomplete(input, {
    fields: ["address_components", "formatted_address", "name"],
    types: ["geocode"]
  });

  autocomplete.addListener("place_changed", () => {
    storePlaceMetadata(input, autocomplete.getPlace());
  });

  input.addEventListener("input", () => clearPlaceMetadata(input));
}

function initGoogleMapsPlaces() {
  if (!window.google?.maps?.places) {
    setDestinationHelp("Google Maps could not be loaded. You can still type destinations manually.");
    return;
  }

  attachAutocomplete("destination-input");
  attachAutocomplete("departure-input");
  googleMapsAutocompleteReady = true;
  setDestinationHelp("Google Maps autocomplete is active for destination and departure search.");
}

function parseManualPlace(value) {
  const parts = value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

  const locality = parts[0] || value;
  const country = parts.length > 1 ? parts[parts.length - 1] : "";

  return {
    label: value,
    locality,
    region: locality,
    country,
    formattedAddress: value,
    mapUrl: buildGoogleMapsSearchUrl(value)
  };
}

function getPlaceValue(inputId) {
  const input = document.getElementById(inputId);
  const rawValue = input?.value.trim() || "";
  if (!rawValue) return null;

  return {
    label: input?.dataset.placeLabel || rawValue,
    locality: input?.dataset.placeLocality || rawValue.split(",")[0].trim(),
    region: input?.dataset.placeRegion || rawValue.split(",")[0].trim(),
    country: input?.dataset.placeCountry || "",
    formattedAddress: input?.dataset.placeAddress || rawValue,
    mapUrl: buildGoogleMapsSearchUrl(input?.dataset.placeAddress || rawValue)
  };
}

function showPage(page) {
  const targetPage = document.getElementById(`page-${page}`);
  if (!targetPage) return;

  document.querySelectorAll(".page").forEach((pageEl) => pageEl.classList.remove("active"));
  targetPage.classList.add("active");

  document.querySelectorAll(".nav-links a").forEach((link) => link.classList.remove("active"));
  const navEl = document.getElementById(`nav-${page}`);
  if (navEl) navEl.classList.add("active");

  window.scrollTo({ top: 0, behavior: "smooth" });
}

function nextStep(step) {
  const currentStepEl = document.getElementById(`step-${currentStep}`);
  const currentDotEl = document.getElementById(`dot-${currentStep}`);
  const nextStepEl = document.getElementById(`step-${step}`);
  const nextDotEl = document.getElementById(`dot-${step}`);
  if (!currentStepEl || !currentDotEl || !nextStepEl || !nextDotEl) return;

  currentStepEl.classList.remove("active");
  currentDotEl.classList.remove("active");
  currentStep = step;
  nextStepEl.classList.add("active");
  nextDotEl.classList.add("active");
}

function formatDateRange(startDate, durationDays) {
  const start = new Date(`${startDate}T00:00:00`);
  if (Number.isNaN(start.getTime())) return "Dates TBD";

  const end = new Date(start);
  end.setDate(start.getDate() + Math.max(durationDays - 1, 0));

  const startMonth = start.toLocaleDateString("en-US", { month: "short" });
  const endMonth = end.toLocaleDateString("en-US", { month: "short" });
  const startDay = start.getDate();
  const endDay = end.getDate();

  return startMonth === endMonth
    ? `${startMonth} ${startDay} - ${endDay}`
    : `${startMonth} ${startDay} - ${endMonth} ${endDay}`;
}

function formatFullDate(dateValue) {
  const date = new Date(`${dateValue}T00:00:00`);
  if (Number.isNaN(date.getTime())) return "Date TBD";

  return date.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric"
  });
}

function extractDurationDays(durationLabel) {
  const match = durationLabel.match(/(\d+)\s*Days?/i);
  return match ? parseInt(match[1], 10) : 5;
}

function extractTravelerCount(travelersLabel) {
  if (/solo/i.test(travelersLabel)) return 1;

  const match = travelersLabel.match(/(\d+)/);
  return match ? parseInt(match[1], 10) : 2;
}

function formatCurrency(amount) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0
  }).format(amount);
}

function getChipLabel(chip) {
  if (!chip) return "";

  const emoji = chip.querySelector(".ic-emoji");
  const rawText = chip.textContent || "";
  return rawText.replace(emoji?.textContent || "", "").trim();
}

function getSelectedBudgetCategory() {
  const selectedChip = document.querySelector("#step-1 .interest-chip.selected");
  return getChipLabel(selectedChip) || "Budget";
}

function getSelectedInterests() {
  return Array.from(document.querySelectorAll("#step-2 .interest-chip.selected"))
    .map((chip) => getChipLabel(chip))
    .filter(Boolean);
}

function getTripDetails() {
  const destinationInput = document.getElementById("destination-input")?.value.trim() || "";
  const destination = getPlaceValue("destination-input") || (destinationInput ? parseManualPlace(destinationInput) : null);
  const countryInput = document.getElementById("country-input")?.value.trim() || "";
  const stateInput = document.getElementById("state-input")?.value.trim() || "";
  const departurePlace = getPlaceValue("departure-input");
  const departure = departurePlace?.label || document.getElementById("departure-input")?.value.trim() || "Your city";
  const durationLabel = document.getElementById("duration-select")?.value || "5 Days / 4 Nights";
  const startDate = document.getElementById("start-date-input")?.value || "";
  const travelersLabel = document.getElementById("travelers-select")?.value || "2 People";
  const budgetAmount = parseInt(document.getElementById("budget-slider")?.value || "40000", 10);
  const accommodation = document.getElementById("accommodation-select")?.value || "Hotel (3 Star)";
  const transport = document.getElementById("transport-select")?.value || "Mixed";
  const specialRequirements = document.getElementById("special-requirements-input")?.value.trim() || "";
  const budgetCategory = getSelectedBudgetCategory();
  const interests = getSelectedInterests();

  if (!destination) {
    showToast("Please choose a destination.");
    showPage("planner");
    return null;
  }

  return {
    destinationLabel: destination.label,
    destinationMapUrl: destination.mapUrl,
    country: countryInput || destination.country || "Selected destination",
    state: stateInput || destination.region || destination.locality || destination.label,
    departure,
    departureMapUrl: departurePlace?.mapUrl || buildGoogleMapsSearchUrl(departure),
    startDate,
    durationLabel,
    durationDays: extractDurationDays(durationLabel),
    travelersLabel,
    travelerCount: extractTravelerCount(travelersLabel),
    budgetAmount,
    budgetCategory,
    accommodation,
    transport,
    specialRequirements,
    interests: interests.length > 0 ? interests : ["Sightseeing", "Food", "Culture"]
  };
}

function buildItineraryData(trip) {
  const destination = trip.destinationLabel || `${trip.state}, ${trip.country}`;
  const dateRange = formatDateRange(trip.startDate, trip.durationDays);
  const totalBudget = Math.max(Math.round(trip.budgetAmount * 0.96), 5000);
  const hotelBudget = Math.round(totalBudget * 0.34);
  const foodBudget = Math.round(totalBudget * 0.19);
  const transportBudget = Math.round(totalBudget * 0.16);
  const activitiesBudget = Math.round(totalBudget * 0.17);
  const shoppingBudget = Math.round(totalBudget * 0.07);
  const contingencyBudget = totalBudget - (hotelBudget + foodBudget + transportBudget + activitiesBudget + shoppingBudget);
  const avgTemp = trip.country === "India" ? "28C avg" : "24C avg";

  const dayThemes = [
    `Arrival & ${trip.state} First Impressions`,
    `${trip.interests[0]} Highlights`,
    "Local Culture & Food Trail",
    `${trip.interests[1] || trip.interests[0]} Discovery`,
    "Relaxed Farewell & Departure",
    `${trip.interests[2] || trip.interests[0]} Adventures`,
    "Hidden Gems & Local Favorites",
    "Scenic Wrap-Up"
  ];

  const days = Array.from({ length: trip.durationDays }, (_, index) => {
    const currentDate = new Date(`${trip.startDate}T00:00:00`);
    if (!Number.isNaN(currentDate.getTime())) {
      currentDate.setDate(currentDate.getDate() + index);
    }

    const dayInterest = trip.interests[index % trip.interests.length];
    const isArrivalDay = index === 0;
    const isDepartureDay = index === trip.durationDays - 1;
    const title = isArrivalDay
      ? `Day ${index + 1} - Arrival & ${trip.state}`
      : isDepartureDay
        ? `Day ${index + 1} - Departure Day`
        : `Day ${index + 1} - ${dayThemes[index] || `${dayInterest} Experiences`}`;

    const items = isArrivalDay
      ? [
          {
            time: "09:00 AM",
            title: `Arrive in ${trip.state}`,
            desc: `Travel from ${trip.departure}. Use ${trip.transport.toLowerCase()} transfers to reach your stay smoothly.`,
            chipClass: "chip-travel",
            chipLabel: "Travel",
            mapUrl: buildActivityMapUrl(`Arrive in ${trip.state}`, destination)
          },
          {
            time: "11:30 AM",
            title: `Check-in at your ${trip.accommodation}`,
            desc: `Settle in, refresh, and keep essentials ready for a light first day around ${trip.state}.`,
            chipClass: "chip-hotel",
            chipLabel: "Stay",
            mapUrl: buildActivityMapUrl(`${trip.accommodation} in ${trip.state}`, destination)
          },
          {
            time: "04:30 PM",
            title: `${trip.state} orientation walk`,
            desc: `Ease into the trip with a gentle outing focused on ${dayInterest.toLowerCase()} and local atmosphere.`,
            chipClass: "chip-sight",
            chipLabel: dayInterest,
            mapUrl: buildActivityMapUrl(`${trip.state} ${dayInterest} places`, destination)
          },
          {
            time: "08:00 PM",
            title: "Dinner featuring local favorites",
            desc: `Choose a well-rated local restaurant that fits your ${trip.budgetCategory.toLowerCase()} budget.`,
            chipClass: "chip-food",
            chipLabel: "Food",
            mapUrl: buildActivityMapUrl(`Best local restaurants in ${trip.state}`, destination)
          }
        ]
      : isDepartureDay
        ? [
            {
              time: "09:00 AM",
              title: `Slow morning in ${trip.state}`,
              desc: "Keep the plan flexible for last-minute shopping, photos, or a short nearby outing.",
              chipClass: "chip-sight",
              chipLabel: "Leisure",
              mapUrl: buildActivityMapUrl(`Popular places in ${trip.state}`, destination)
            },
            {
              time: "12:30 PM",
              title: "Check-out and departure transfer",
              desc: `Leave buffer time for traffic, tickets, and baggage before heading back toward ${trip.departure}.`,
              chipClass: "chip-travel",
              chipLabel: "Departure",
              mapUrl: trip.departureMapUrl
            }
          ]
        : [
            {
              time: "09:00 AM",
              title: `${dayInterest} experience in ${trip.state}`,
              desc: `Start with one of the destination's best-known ${dayInterest.toLowerCase()} spots while crowds are lighter.`,
              chipClass: "chip-sight",
              chipLabel: dayInterest,
              mapUrl: buildActivityMapUrl(`${dayInterest} places in ${trip.state}`, destination)
            },
            {
              time: "01:00 PM",
              title: "Lunch at a well-rated local restaurant",
              desc: "Pick a place with strong reviews and regional dishes that fit your budget.",
              chipClass: "chip-food",
              chipLabel: "Food",
              mapUrl: buildActivityMapUrl(`Best restaurants in ${trip.state}`, destination)
            },
            {
              time: "03:30 PM",
              title: `${trip.interests[(index + 1) % trip.interests.length]} stop`,
              desc: `Balance the day with another activity aligned to your selected interests in ${destination}.`,
              chipClass: "chip-sight",
              chipLabel: trip.interests[(index + 1) % trip.interests.length],
              mapUrl: buildActivityMapUrl(
                `${trip.interests[(index + 1) % trip.interests.length]} places in ${trip.state}`,
                destination
              )
            },
            {
              time: "07:30 PM",
              title: "Evening free time",
              desc: "Wrap up with a relaxed dinner, market walk, or neighborhood exploration.",
              chipClass: "chip-food",
              chipLabel: "Evening",
              mapUrl: buildActivityMapUrl(`Evening places in ${trip.state}`, destination)
            }
          ];

    return {
      title,
      date: formatFullDate(currentDate.toISOString().slice(0, 10)),
      open: index === 0,
      items
    };
  });

  const forecastBase = trip.country === "India" ? 27 : 22;
  const weather = Array.from({ length: Math.min(trip.durationDays, 6) }, (_, index) => {
    const labels = ["Sunny", "Cloudy", "Breezy", "Rain", "Sunny", "Cloudy"];
    const labelDate = new Date(`${trip.startDate}T00:00:00`);
    if (!Number.isNaN(labelDate.getTime())) {
      labelDate.setDate(labelDate.getDate() + index);
    }

    return [
      labels[index % labels.length],
      `${forecastBase + (index % 3)}C`,
      Number.isNaN(labelDate.getTime())
        ? `Day ${index + 1}`
        : labelDate.toLocaleDateString("en-US", { month: "short", day: "numeric" })
    ];
  });

  const tips = [
    `Save offline Google Maps for ${trip.state} before you leave ${trip.departure}.`,
    "Keep 10-15% of your budget aside for tickets, snacks, and last-minute transport.",
    `Prioritize ${trip.interests[0].toLowerCase()} plans earlier in the day for a smoother schedule.`,
    trip.specialRequirements
      ? `Remember your special request: ${trip.specialRequirements}.`
      : `Book your accommodation early if you are traveling in peak season.`,
    "Use this plan as a base and swap activities depending on local weather and opening hours."
  ];

  return {
    destinationLabel: `${destination.toUpperCase()} - ${new Date(`${trip.startDate}T00:00:00`).toLocaleDateString("en-US", {
      month: "short",
      year: "numeric"
    }).toUpperCase()}`,
    title: `${trip.durationDays} Days in ${trip.state}`,
    shareMessage: `${trip.state} itinerary link copied to clipboard!`,
    destinationMapUrl: trip.destinationMapUrl,
    departureMapUrl: trip.departureMapUrl,
    routeLabel: `${trip.departure} to ${destination}`,
    badges: [
      `Dates ${dateRange}`,
      `${trip.travelerCount} ${trip.travelerCount === 1 ? "Traveller" : "Travellers"}`,
      `${formatCurrency(totalBudget)} est.`,
      avgTemp
    ],
    days,
    costBreakdown: [
      ["Travel", formatCurrency(transportBudget)],
      [`Stay (${Math.max(trip.durationDays - 1, 1)} nights)`, formatCurrency(hotelBudget)],
      ["Food & Dining", formatCurrency(foodBudget)],
      ["Activities", formatCurrency(activitiesBudget)],
      ["Shopping (est.)", formatCurrency(shoppingBudget)],
      ["Miscellaneous", formatCurrency(contingencyBudget)],
      ["Total Estimate", formatCurrency(totalBudget), true]
    ],
    weather,
    tips
  };
}

function generateItinerary() {
  const tripDetails = getTripDetails();
  if (!tripDetails) return;

  itineraryData = buildItineraryData(tripDetails);
  renderItineraryPage();
  showToast("Generating your itinerary...");
  setTimeout(() => showPage("itinerary"), 600);
}

function updateBudget(value) {
  const budgetDisplay = document.getElementById("budget-display");
  if (!budgetDisplay) return;

  budgetDisplay.textContent = formatCurrency(parseInt(value, 10));
}

function selectBudget(el) {
  document.querySelectorAll("#step-1 .interest-chip").forEach((chip) => chip.classList.remove("selected"));
  el.classList.add("selected");
}

function toggleInterest(el) {
  el.classList.toggle("selected");
}

function toggleDay(header) {
  const body = header.nextElementSibling;
  const toggle = header.querySelector(".day-toggle");
  if (!body || !toggle) return;

  body.classList.toggle("open");
  toggle.style.transform = body.classList.contains("open") ? "rotate(180deg)" : "rotate(0)";
}

function switchAuth(mode) {
  document.querySelectorAll(".auth-tab").forEach((tab, index) => {
    tab.classList.toggle("active", (mode === "login" && index === 0) || (mode === "register" && index === 1));
  });

  const loginForm = document.getElementById("auth-login");
  const registerForm = document.getElementById("auth-register");
  if (loginForm) loginForm.classList.toggle("active", mode === "login");
  if (registerForm) registerForm.classList.toggle("active", mode === "register");
}

function loginUser() {
  showToast("Signed in successfully.");
  setTimeout(() => showPage("home"), 600);
}

function registerUser() {
  showToast("Account created successfully.");
  setTimeout(() => showPage("home"), 600);
}

function activateFilter(el) {
  document.querySelectorAll(".filt-btn").forEach((button) => button.classList.remove("active"));
  el.classList.add("active");
  showToast("Filtering destinations...");
}

function showToast(msg) {
  const toast = document.getElementById("toast");
  if (!toast) return;

  toast.textContent = msg;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 3000);
}

function renderTimelineItem(item, isLastItem) {
  return `
    <div class="tl-item">
      <div class="tl-time">${item.time}</div>
      <div class="tl-dot-col">
        <div class="tl-dot"></div>
        ${isLastItem ? "" : '<div class="tl-line"></div>'}
      </div>
      <div class="tl-content">
        <div class="tl-title">
          <a href="${item.mapUrl || "#"}" target="_blank" rel="noreferrer" style="color:inherit; text-decoration:none; border-bottom:1px dashed rgba(196, 98, 58, 0.35);">
            ${item.title}
          </a>
        </div>
        <div class="tl-desc">${item.desc}</div>
        <div style="margin: 8px 0 10px;">
          <a href="${item.mapUrl || "#"}" target="_blank" rel="noreferrer" style="font-size:12px; color: var(--terracotta); text-decoration:none; font-weight:500;">
            Open in Google Maps
          </a>
        </div>
        <span class="tl-chip ${item.chipClass}">${item.chipLabel}</span>
      </div>
    </div>
  `;
}

function renderDayCard(day) {
  return `
    <div class="day-card">
      <div class="day-header" onclick="toggleDay(this)">
        <div>
          <div class="day-num">${day.title}</div>
          <div class="day-date">${day.date}</div>
        </div>
        <div class="day-toggle" style="transform:${day.open ? "rotate(180deg)" : "rotate(0)"}">⌄</div>
      </div>
      <div class="day-body ${day.open ? "open" : ""}">
        <div class="timeline">
          ${day.items.map((item, index) => renderTimelineItem(item, index === day.items.length - 1)).join("")}
        </div>
      </div>
    </div>
  `;
}

function renderCostRow([label, value, total]) {
  const safeLabel = total ? `<strong>${label}</strong>` : label;
  return `<div class="cost-row"><span>${safeLabel}</span><span>${value}</span></div>`;
}

function renderWeatherCard([icon, temp, label]) {
  return `
    <div class="weather-day">
      <span class="weather-icon">${icon}</span>
      <div class="weather-temp">${temp}</div>
      <div class="weather-label">${label}</div>
    </div>
  `;
}

function renderItineraryPage() {
  const itineraryPage = document.getElementById("page-itinerary");
  if (!itineraryPage) return;

  itineraryPage.innerHTML = `
    <div class="itin-header">
      <div class="itin-header-inner">
        <div>
          <div class="itin-dest">${itineraryData.destinationLabel}</div>
          <h1 class="itin-title">${itineraryData.title}</h1>
          <div class="itin-meta">
            ${itineraryData.badges.map((badge) => `<div class="itin-badge">${badge}</div>`).join("")}
          </div>
        </div>
        <button class="itin-share-btn" onclick="showToast('${itineraryData.shareMessage}')">Share Trip ↗</button>
      </div>
    </div>

    <div class="itin-body">
      <div class="itin-days">
        ${itineraryData.days.map((day) => renderDayCard(day)).join("")}
      </div>

      <div class="itin-sidebar">
        <div class="side-card">
          <h3>Google Maps</h3>
          <div class="cost-row">
            <span>Trip route</span>
            <span>${itineraryData.routeLabel || "Open in Maps"}</span>
          </div>
          <div style="display:flex; gap:10px; margin-top:16px; flex-wrap:wrap">
            <a class="itin-share-btn" href="${itineraryData.destinationMapUrl || "#"}" target="_blank" rel="noreferrer" style="text-decoration:none; display:inline-flex; align-items:center;">
              View destination
            </a>
            <a class="btn-step-back" href="${itineraryData.departureMapUrl || "#"}" target="_blank" rel="noreferrer" style="text-decoration:none; display:inline-flex; align-items:center; justify-content:center;">
              Departure map
            </a>
          </div>
        </div>
        <div class="side-card">
          <h3>Cost Breakdown</h3>
          ${itineraryData.costBreakdown.map((row) => renderCostRow(row)).join("")}
        </div>
        <div class="side-card">
          <h3>Weather Forecast</h3>
          <div class="weather-grid">
            ${itineraryData.weather.map((day) => renderWeatherCard(day)).join("")}
          </div>
        </div>
        <div class="side-card">
          <h3>Travel Tips</h3>
          <ul class="tips-list">
            ${itineraryData.tips.map((tip) => `<li><span class="tip-dot">-</span>${tip}</li>`).join("")}
          </ul>
        </div>
      </div>
    </div>
  `;
}

window.showPage = showPage;
window.nextStep = nextStep;
window.generateItinerary = generateItinerary;
window.updateBudget = updateBudget;
window.selectBudget = selectBudget;
window.toggleInterest = toggleInterest;
window.toggleDay = toggleDay;
window.switchAuth = switchAuth;
window.loginUser = loginUser;
window.registerUser = registerUser;
window.activateFilter = activateFilter;
window.showToast = showToast;
window.handleCountryChange = handleCountryChange;
window.handleStateChange = handleStateChange;

renderItineraryPage();
updateBudget(document.getElementById("budget-slider")?.value || "40000");
populateCountryOptions("India");
populateStateOptions("India", "Goa");
syncDestinationFromSelectors();

if (GOOGLE_MAPS_API_KEY) {
  loadGoogleMapsApi();
} else {
  setDestinationHelp("Add your Google Maps API key in window.WANDERLUST_CONFIG.googleMapsApiKey to enable autocomplete.");
}
