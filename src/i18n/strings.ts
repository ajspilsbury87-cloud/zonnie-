/**
 * Central string dictionary — all user-visible text in Dutch (nl) and
 * English (en).
 *
 * Usage: never import this file directly. Use `useStrings()` from
 * `@/src/i18n/useStrings`, which returns the correct sub-object for the
 * user's current language preference.
 *
 * Naming: grouped by feature area. Function-valued strings handle
 * dynamic values — call them like `t.outdoorScreens(3)` → "3 outdoor
 * screens" (EN) or "3 buitenschermen" (NL).
 *
 * TypeScript enforces completeness: `en` must satisfy the same shape as
 * `nl`, so a missing translation is a compile-time error.
 */

export const strings = {
  // ─────────────────────────────────────────────────────────────────────
  nl: {
    // Score labels
    scoreFull: 'Volle zon',
    scoreMostly: 'Grotendeels zonnig',
    scorePartly: 'Deels zonnig',
    scoreMostlyShade: 'Grotendeels schaduw',
    scoreShade: 'In de schaduw',

    // Weather strip
    weatherLoading: 'Weer laden…',
    weatherNoData: 'Geen weerdata',

    // Venue type filter
    filterWhat: 'WAT',
    filterAreas: 'Buurten',
    filterAreasA11y: 'Open buurtfilter',
    filterTimeA11y: 'Open tijdkiezer',
    filterBar: '🍺 Bar',
    filterRestaurant: '🍽️ Restaurant',
    filterCoffee: '☕ Koffie',
    filterOutdoor: '⚽ Buiten',
    filterNearMe: '📍 Dichtbij',
    filterMatch: '📺 Match',
    filterFavourites: '🤍 Favorieten',
    filterHiddenGem: '💎 Hidden gem',
    filterOutdoorA11y: 'Toon alleen terrassen met buitenschermen',
    filterNearMeA11y: 'Sorteer op dichtstbijzijnde zonnige plek',
    filterHiddenGemA11y: 'Toon alleen minder bekende terrassen (beste zon, minder mensen)',

    // More filters toggle
    moreFilters: 'Meer filters',
    hideFilters: 'Verberg meer filters',
    showFilters: 'Toon meer filters',
    clearSearch: (query: string) => `🔍 "${query}" ✕`,
    removeRegion: (region: string) => `📍 ${region} ✕`,
    clearSearchA11y: (query: string) => `Wis zoekterm "${query}"`,
    removeRegionA11y: (region: string) => `Verwijder ${region} filter`,
    switchToEnglish: 'Switch to English',
    switchToDutch: 'Schakel naar Nederlands',

    // Time range scrubber
    when: 'WANNEER',
    morning: 'Ochtend',
    afternoon: 'Middag',
    evening: 'Avond',
    exactTimesProLock: '🔒 Exacte tijden instellen — Pro',
    showShadows: '🔆 Schaduwen tonen',
    shadowsOn: '🌑 Schaduwen aan',
    showShadowsA11y: 'Toon gebouwschaduwen op kaart',
    shadowsHideA11y: 'Verberg gebouwschaduwen op kaart',
    exactTimesA11y: 'Schakel exacte tijden in met Pro',
    shadowZoomHint: 'Zoom in om schaduwen te zien',

    // Terrace detail sheet
    sunToday: 'Zon vandaag',
    chanceOfRain: (pct: number) => `🌧 ${pct}% kans op regen`,
    bestVisitTime: 'Beste bezoektijd',
    sundownerLeaves: (min: number) => `☀️ Zon verlaat dit terras over ${min} min`,
    nextSunnySpot: (name: string, untilHHmm: string, walkMin: number) =>
      `Zon blijft tot ${untilHHmm} bij ${name} · ${walkMin} min lopen →`,
    sunBuilding: '↑ Zon in opkomst',
    sunFading: '↓ Zon neemt af',
    sunHolding: '→ Zon stabiel',
    vibe: 'Sfeer',
    address: 'Adres',
    openNow: 'Nu open',
    closedNow: 'Nu gesloten',
    outdoorScreen: '1 buitenscherm',
    outdoorScreens: (n: number) => `${n} buitenschermen`,
    photosLocked: "Foto's · Pro",
    loadingPhotos: "Foto's laden…",
    todayHours: 'Openingstijden vandaag',
    curatedByZonnie: 'Gecureerd door Zonnie',
    loadingHours: 'Openingstijden laden…',
    hoursUnavailable: 'Openingstijden onbekend',
    phone: 'Telefoon',
    website: 'Website',
    showOnMap: 'Op kaart',
    viewInMaps: 'Open in Maps',
    share: 'Delen ☀️',
    getDirections: 'Routebeschrijving',
    reserveTable: 'Reserveer een tafel',

    // Group vote shortlist
    askTheGroup: (n: number) => `Vraag de groep (${n})`,
    askTheGroupA11y: 'Deel terrassenselectie met de groep',
    cancelShortlist: '✕',
    cancelShortlistA11y: 'Selectie annuleren',
    voteShareMessage: (url: string) => `Terras? ☀️ Stem hier: ${url}`,
    shortlistFull: 'Max. 3 terrassen — oudste vervangen',

    // Landing page
    tagline: 'De zonnigste terrassen van Amsterdam',
    sunniestNow: 'NU ZONNIGST',
    seeAllTerraces: 'Alle terrassen bekijken',
    featured: 'Uitgelicht',
    featuredSection: 'UITGELICHT',

    // World Cup 2026 — date-gated, auto-retires after WC_END (2026-07-19)
    wcSpotlightTitle: '⚽ Kijk het WK in de zon',
    wcSpotlightBody: (n: number) => `${n} terrassen met groot scherm`,
    wcSpotlightCta: 'Vind je scherm-terras',
    // Banner shown on matchdays and the evening before a late-night kickoff.
    // 'vanavond' = this evening; 'vannacht' = tonight/late-night.
    wcBannerEvening: (flag: string, opponent: string, time: string) =>
      `🇳🇱 Nederland – ${opponent} ${flag} vanavond ${time} · vind je scherm-terras`,
    wcBannerLateNight: (flag: string, opponent: string, time: string) =>
      `🇳🇱 Nederland – ${opponent} ${flag} vannacht ${time} · vind je scherm-terras`,
    // Detail-sheet World Cup section headers (by tier).
    // 'confirmed' — sourced from the venue's own website/socials.
    // 'likely'    — listed in a credible guide but not first-party confirmed.
    // 'fallback'  — screen terrace; we infer they'll show Oranje, not confirmed.
    wcShowingHere: '📺 WK kijken hier',
    wcLikelyListed: '📺 Vermoedelijk WK hier',
    wcBigScreen: '📺 Groot scherm',
    // Coverage body lines.
    wcAllMatches: 'Toont alle WK-wedstrijden',
    wcOranjeMatches: 'Toont de Oranje WK-wedstrijden',
    // Fallback body — reads as a likelihood, never a venue promise.
    wcFallbackBody: 'Vermoedelijk Oranje-wedstrijden op het scherm',
    // Single fixture line — flag + opponent + date + time.
    // e.g. "🇯🇵 vs Japan · za 14 jun · 22:00"
    wcFixture: (flag: string, opponent: string, dateLabel: string, time: string) =>
      `${flag} vs ${opponent} · ${dateLabel} · ${time}`,
    // Source / citation link label.
    wcSource: 'Bron',

    // Search box
    searchPlaceholder: 'Zoek terrassen, vibes, adressen…',

    // Date picker
    today: 'Vandaag',
    tomorrow: 'Morgen',

    // Notification prompt
    notifHeadline: 'Mis nooit een zonnig terras',
    notifBody:
      "Een melding 's ochtends als je favoriete terrassen binnenkort zonnig worden — plus een dagelijks bericht bij een mooie zonnige dag in Amsterdam.",
    notifAllow: 'Stuur mij berichten',
    notifLater: 'Nog niet',

    // TerraceList empty states
    noMatchModeTerraces: 'Geen buiten-TV terrassen gevonden',
    noMatchModeHint: 'Tik 📺 Match om te wissen, of verbreed je andere filters.',
    noFavourites: 'Nog geen favorieten',
    noFavouritesHint: 'Tik ♡ op een terrasdetail om het op te slaan.',
    noResults: 'Geen resultaten',
    noResultsQuery: (query: string) => `Niets in de dataset komt overeen met "${query}".`,
    noTerraces: 'Geen terrassen gevonden',
    noTerracesHint: 'Probeer een andere zoekopdracht, minder buurten of een ruimere tijdperiode.',
    filterHint: '⛛ Tik om te filteren op buurt of naam',

    // Map
    locationOff: 'Locatie uitgeschakeld',
    locationOffBody:
      'Zonnie heeft locatie nodig om de kaart op jou te centreren. Schakel het in via iOS Instellingen → Privacy → Locatie → Zonnie.',
    locationError: 'Kon locatie niet ophalen',
    locationErrorBody: 'Probeer het over een moment opnieuw.',
    notNow: 'Nog niet',
    openSettings: 'Open Instellingen',
    mapHint: '📍 Tik op een pin om uurlijks zonlicht te zien',
    centreMap: 'Centreer kaart op mijn locatie',

    // Map region pill
    currentlyViewing: (label: string) =>
      `Momenteel ${label} in beeld. Tik om opnieuw in te zoomen.`,

    // Time range picker
    visitingFrom: 'Bezoek van',
    to: 'tot',
    now: 'Nu',
    from: 'Van',

    // Error boundary
    somethingWentWrong: 'Er is iets misgegaan',
    tryAgain: 'Opnieuw proberen',

    // Hint bubble
    dismissHint: 'Tik om dit bericht te verbergen',

    // Onboarding
    skipIntro: 'Overslaan',
    skipIntroLabel: 'Sla de intro over',
    slide1Headline: 'Vind het zonnigste terras van Amsterdam.',
    slide1Sub: 'Uur voor uur. Per buurt.',
    slide1Cta: 'Verder →',
    slide2Headline: 'Tik op een pin om te zien wanneer de zon schijnt.',
    slide2Sub: 'Plan vooruit. Filter op buurt. Zoek zon.',
    slide2Cta: 'Ga aan de slag ☀',

    // Paywall trigger headlines + subheads
    paywallTimeScrubberHeadline: 'Versleep naar elk uur',
    paywallTimeScrubberSub:
      'Scrol door de dag en zie de zonscores live bijwerken voor elk terras.',
    paywallRatingsHeadline: 'Openingstijden & contact van vandaag',
    paywallRatingsSub:
      'Live openingstijden, telefoon en website direct van Google, voor elk terras.',
    paywallBusynessHeadline: 'Bekijk drukte in realtime',
    paywallBusynessSub:
      'Weet welke terrassen rustig zijn voordat je vertrekt. Zonnig én leeg is het doel.',
    paywallPhotosHeadline: "Bekijk terrasfoto's",
    paywallPhotosSub: "Swipe door foto's voordat je de tocht onderneemt.",
    paywallFavouritesHeadline: 'Onbeperkte favorieten opslaan',
    paywallFavouritesSub:
      'Bewaar al je vaste plekken en ontvang een melding als ze op het punt staan zonnig te worden.',
    paywallWidgetHeadline: 'Widget op je beginscherm',
    paywallWidgetSub: 'Top 3 zonnigste terrassen dichtbij, altijd in één oogopslag.',
    paywallNotificationsHeadline: 'Ontvang zonmeldingen',
    paywallNotificationsSub:
      "Een melding 's ochtends als morgen een goede terrasdag wordt.",
    paywallBestWindowHeadline: 'Beste bezoekmoment',
    paywallBestWindowSub:
      'We berekenen het perfecte 2–3 uurs-venster per terras, zodat jij dat niet hoeft.',
    paywallReservationsHeadline: 'Reserveer direct een tafel',
    paywallReservationsSub:
      'Boek je plekje in de zon met één tik — direct via de reserveringspagina van het terras.',
    paywallShareHeadline: 'Deel een terraskaartje',
    paywallShareSub:
      'Een mooi kaartje met zonscore, beste bezoekmoment en Zonnie-branding. Gemaakt voor Stories.',
    paywallDefaultHeadline: 'Zonnie Pro vrijschakelen',
    paywallDefaultSub:
      "De volledige Amsterdam-zonervaring — tijdschuifregelaar, openingstijden, foto's, widget en meer.",

    // Paywall feature bullets
    proFeature1: 'Tijdschuifregelaar — versleep naar elk uur',
    proFeature2: "Terrasfoto's",
    proFeature3: 'Onbeperkte favorieten',

    // Paywall tier labels
    tierMonthly: 'Maandelijks',
    tierMonthlyPeriod: 'per maand',
    tierYearly: 'Jaarlijks',
    tierYearlyPeriod: 'per jaar',
    tierLifetime: 'Eenmalig',
    tierLifetimePeriod: 'eenmalig',
    bestDeal: 'Beste deal',
    tierMonthlyA11y: (price: string) => `Maandelijks abonnement, ${price} per maand`,
    tierYearlyA11y: (price: string) =>
      `Jaarlijks abonnement, ${price} per jaar, beste deal`,
    tierLifetimeA11y: (price: string) => `Eenmalig, ${price}`,
    buyYearly: (price: string) => `Begin voor ${price}/jr`,
    buyMonthly: (price: string) => `Begin voor ${price}/mnd`,
    buyLifetime: (price: string) => `Eenmalig kopen — ${price}`,
    buyYearlyA11y: 'Doorgaan met jaarlijks abonnement',
    buyMonthlyA11y: 'Doorgaan met maandelijks abonnement',
    buyLifetimeA11y: 'Eenmalig kopen',
    legalText:
      'Abonnementen worden automatisch verlengd. Annuleer altijd via Instellingen. Betaling wordt in rekening gebracht via je Apple ID bij bevestiging.',
    termsOfUse: 'Gebruiksvoorwaarden',
    privacyPolicy: 'Privacybeleid',
    restorePurchases: 'Aankopen herstellen',
    restoreA11y: 'Eerdere aankopen herstellen',
    alertNotAvailableTitle: 'Niet beschikbaar',
    alertNotAvailableBody: 'Winkel is nu niet beschikbaar. Probeer het zo opnieuw.',
    alertPurchaseFailedTitle: 'Aankoop mislukt',
    alertPurchaseFailedDefault: 'Er is iets misgegaan. Probeer het opnieuw.',
    alertRestoreFailedTitle: 'Herstel mislukt',
    alertRestoreFailedDefault:
      'Aankopen konden niet worden hersteld. Probeer het opnieuw.',
    alertNoPurchasesTitle: 'Geen aankopen gevonden',
    alertNoPurchasesBody:
      'Er is geen eerdere Zonnie Pro-aankoop gevonden voor dit Apple ID.',
    alertOk: 'OK',
    closePaywall: 'Sluiten',
    closePaywallA11y: 'Sluiten',

    // Pro entry pill (TerraceList header) + subscribed state (ProPaywall)
    proEntryButton: '⭐ Zonnie Pro',
    proEntryActive: '⭐ Zonnie Pro ✓',
    proActiveTitle: 'Je hebt Zonnie Pro',
    proActiveManageHint: 'Beheer je abonnement via iOS Instellingen',

    // Sun score legend (left-edge map overlay)
    legendTitle: 'Zon score',
    legendScorchio: 'Snikheet',
    legendScorchioSub: 'factor 50 weer',
    legendSunSoaked: 'Zonovergoten',
    legendSunSoakedSub: 'ideaal terrasweer',
    legendDappled: 'Wisselend',
    legendDappledSub: 'zon komt en gaat',
    legendShady: 'Schaduwrijk',
    legendShadySub: 'vooral schaduw',
    legendShadeCity: 'In de schaduw',
    legendShadeCitySub: 'neem een trui mee',

    // Today's Verdict card
    verdictSectionLabel: 'VANDAAG',
    verdictHigh: '☀️ Perfecte terrasdag',
    verdictMid: '⛅ Hier en daar zonnig',
    verdictLow: '☁️ Eigenlijk geen terrasdag',
    verdictLoading: 'Dagelijkse samenvatting laden…',
    verdictStatLine: (count: number, fromHour: number, toHour: number) =>
      `${count} terrassen boven 65% tussen ${fromHour}:00–${toHour}:00`,
    verdictStatLineNoWindow: (count: number) =>
      `${count} ${count === 1 ? 'terras' : 'terrassen'} boven 65% vandaag`,
    verdictTopPicks: 'TOP PICKS VANDAAG',
    verdictFavouriteLine: (name: string, untilHour: number) =>
      `Jouw favoriet: ${name} heeft zon tot ${untilHour}:00`,

    // Chase the Sun crawl sheet
    chaseTheSun: 'Chase the sun',
    crawlSubtitle: (neighbourhood: string, stops: number, untilHour: number) =>
      `${neighbourhood} · ${stops} stops · zon tot ${untilHour}:00`,
    crawlLeaveBy: (untilHour: number) =>
      `Verlaat stop 1 voor ${untilHour}:00 om in de zon te blijven`,
    crawlSunChip: (fromHour: number, untilHour: number) =>
      `${fromHour}:00 – ${untilHour}:00 · in de zon`,
    crawlWalkConnector: (minutes: number, metres: number) =>
      `${minutes} min lopen · ${metres} m`,
    crawlGoldenFinish: 'Gouden-uur finisher',
    crawlShareRoute: 'Deel deze zonnige route',
    crawlStart: 'Start',
    crawlShuffle: 'Schudden',
    crawlNoRoute: 'Geen zonnige route beschikbaar vanuit dit terras op dit moment.',
    crawlShareText: (
      area: string,
      stop1name: string,
      stop1until: number,
      stop2name: string,
      stop2walk: number,
      stop3name: string,
      appUrl: string,
    ) =>
      `☀️ Mijn Chase the Sun route door ${area}:\n1. ${stop1name} — zon tot ${stop1until}:00\n2. ${stop2name} — ${stop2walk} min lopen\n3. ${stop3name} — gouden uur 🌅\n\nBlijf de hele middag in de zon → ${appUrl}`,
    crawlShareTextShort: (
      area: string,
      stop1name: string,
      stop1until: number,
      stop2name: string,
      stop2walk: number,
      appUrl: string,
    ) =>
      `☀️ Mijn Chase the Sun route door ${area}:\n1. ${stop1name} — zon tot ${stop1until}:00\n2. ${stop2name} — ${stop2walk} min lopen 🌅\n\nBlijf de hele middag in de zon → ${appUrl}`,
    crawlChaseButton: '☀️ Chase the sun vanaf hier',
  },

  // ─────────────────────────────────────────────────────────────────────
  en: {
    // Score labels
    scoreFull: 'Full sun',
    scoreMostly: 'Mostly sunny',
    scorePartly: 'Partly sunny',
    scoreMostlyShade: 'Mostly shade',
    scoreShade: 'In shadow',

    // Weather strip
    weatherLoading: 'Loading weather…',
    weatherNoData: 'No weather data',

    // Venue type filter
    filterWhat: 'WHAT',
    filterAreas: 'Areas',
    filterAreasA11y: 'Open neighbourhood filter',
    filterTimeA11y: 'Open time range picker',
    filterBar: '🍺 Bar',
    filterRestaurant: '🍽️ Restaurant',
    filterCoffee: '☕ Coffee',
    filterOutdoor: '⚽ Outdoor',
    filterNearMe: '📍 Near me',
    filterMatch: '📺 Match',
    filterFavourites: '🤍 Favourites',
    filterHiddenGem: '💎 Hidden gem',
    filterOutdoorA11y: 'Show only terraces with outdoor screens',
    filterNearMeA11y: 'Sort by nearest sunny spot',
    filterHiddenGemA11y: 'Show only lesser-known terraces (best sun, fewer people)',

    // More filters toggle
    moreFilters: 'More filters',
    hideFilters: 'Hide more filters',
    showFilters: 'Show more filters',
    clearSearch: (query: string) => `🔍 "${query}" ✕`,
    removeRegion: (region: string) => `📍 ${region} ✕`,
    clearSearchA11y: (query: string) => `Clear search "${query}"`,
    removeRegionA11y: (region: string) => `Remove ${region} filter`,
    switchToEnglish: 'Switch to English',
    switchToDutch: 'Switch to Dutch',

    // Time range scrubber
    when: 'WHEN',
    morning: 'Morning',
    afternoon: 'Afternoon',
    evening: 'Evening',
    exactTimesProLock: '🔒 Set exact hours — Pro',
    showShadows: '🔆 Show shadows',
    shadowsOn: '🌑 Shadows on',
    showShadowsA11y: 'Show building shadows on map',
    shadowsHideA11y: 'Hide building shadows on map',
    exactTimesA11y: 'Unlock exact times with Pro',
    shadowZoomHint: 'Zoom in to see shadows',

    // Terrace detail sheet
    sunToday: 'Sun today',
    chanceOfRain: (pct: number) => `🌧 ${pct}% chance of rain`,
    bestVisitTime: 'Best time to visit',
    sundownerLeaves: (min: number) => `☀️ Sun leaves this terrace in ${min} min`,
    nextSunnySpot: (name: string, untilHHmm: string, walkMin: number) =>
      `Sun stays till ${untilHHmm} at ${name} · ${walkMin} min walk →`,
    sunBuilding: '↑ Sun building',
    sunFading: '↓ Sun fading',
    sunHolding: '→ Sun holding',
    vibe: 'Vibe',
    address: 'Address',
    openNow: 'Open now',
    closedNow: 'Closed now',
    outdoorScreen: '1 outdoor screen',
    outdoorScreens: (n: number) => `${n} outdoor screens`,
    photosLocked: 'Photos · Pro',
    loadingPhotos: 'Loading photos…',
    todayHours: "Today's hours",
    curatedByZonnie: 'Curated by Zonnie',
    loadingHours: 'Loading hours…',
    hoursUnavailable: 'Hours unavailable',
    phone: 'Phone',
    website: 'Website',
    showOnMap: 'Show on Map',
    viewInMaps: 'View in Maps',
    share: 'Share ☀️',
    getDirections: 'Get Directions',
    reserveTable: 'Reserve a table',

    // Group vote shortlist
    askTheGroup: (n: number) => `Ask the group (${n})`,
    askTheGroupA11y: 'Share terrace shortlist with the group',
    cancelShortlist: '✕',
    cancelShortlistA11y: 'Cancel selection',
    voteShareMessage: (url: string) => `Terrace? ☀️ Vote here: ${url}`,
    shortlistFull: 'Max 3 terraces — oldest replaced',

    // Landing page
    tagline: 'The sunniest terraces in Amsterdam',
    sunniestNow: 'SUNNIEST RIGHT NOW',
    seeAllTerraces: 'See all terraces',
    featured: 'Featured',
    featuredSection: 'FEATURED',

    // World Cup 2026 — date-gated, auto-retires after WC_END (2026-07-19)
    wcSpotlightTitle: '⚽ Watch the World Cup in the sun',
    wcSpotlightBody: (n: number) => `${n} terraces with a big screen`,
    wcSpotlightCta: 'Find your screen terrace',
    // Banner shown on matchdays and the evening before a late-night kickoff.
    wcBannerEvening: (flag: string, opponent: string, time: string) =>
      `🇳🇱 Netherlands – ${opponent} ${flag} tonight ${time} · find your screen terrace`,
    wcBannerLateNight: (flag: string, opponent: string, time: string) =>
      `🇳🇱 Netherlands – ${opponent} ${flag} late-night ${time} · find your screen terrace`,
    // Detail-sheet World Cup section headers (by tier).
    wcShowingHere: '📺 Showing the World Cup here',
    wcLikelyListed: '📺 Likely showing the World Cup',
    wcBigScreen: '📺 Big screen venue',
    // Coverage body lines.
    wcAllMatches: 'Showing all World Cup matches',
    wcOranjeMatches: 'Showing the Dutch World Cup matches',
    // Fallback body — reads as a likelihood, never a venue promise.
    wcFallbackBody: 'Likely showing the Oranje matches on the screen',
    // Single fixture line — flag + opponent + date + time.
    // e.g. "🇯🇵 vs Japan · Sat 14 Jun · 22:00"
    wcFixture: (flag: string, opponent: string, dateLabel: string, time: string) =>
      `${flag} vs ${opponent} · ${dateLabel} · ${time}`,
    // Source / citation link label.
    wcSource: 'Source',

    // Search box
    searchPlaceholder: 'Search terraces, vibes, addresses…',

    // Date picker
    today: 'Today',
    tomorrow: 'Tomorrow',

    // Notification prompt
    notifHeadline: 'Never miss a sunny terrace',
    notifBody:
      "Get a morning heads-up when your favourite terraces are forecast to be sunny — plus a daily alert on any day with a great stretch of terrace weather across Amsterdam.",
    notifAllow: 'Notify me',
    notifLater: 'Not now',

    // TerraceList empty states
    noMatchModeTerraces: 'No outdoor-TV terraces match',
    noMatchModeHint: 'Tap 📺 Match again to clear, or widen your other filters.',
    noFavourites: 'No favourites yet',
    noFavouritesHint: 'Tap the ♡ on a terrace detail to save it for later.',
    noResults: 'No matches',
    noResultsQuery: (query: string) => `Nothing in the dataset matches "${query}".`,
    noTerraces: 'No terraces match',
    noTerracesHint:
      'Try a different search, fewer neighbourhoods, or a wider time range.',
    filterHint: '⛛ Tap to refine by area or name',

    // Map
    locationOff: 'Location off',
    locationOffBody:
      'Zonnie needs location to centre the map on you. Enable it in iOS Settings → Privacy → Location → Zonnie.',
    locationError: "Couldn't get location",
    locationErrorBody: 'Try again in a moment.',
    notNow: 'Not now',
    openSettings: 'Open Settings',
    mapHint: '📍 Tap a pin to see hourly sun',
    centreMap: 'Centre map on my location',

    // Map region pill
    currentlyViewing: (label: string) =>
      `Currently viewing ${label}. Tap to recenter.`,

    // Time range picker
    visitingFrom: 'Visiting from',
    to: 'to',
    now: 'Now',
    from: 'From',

    // Error boundary
    somethingWentWrong: 'Something went wrong',
    tryAgain: 'Try again',

    // Hint bubble
    dismissHint: 'Tap to dismiss this hint',

    // Onboarding
    skipIntro: 'Skip',
    skipIntroLabel: 'Skip the intro',
    slide1Headline: 'Find the sunniest terrace in Amsterdam.',
    slide1Sub: 'Hour by hour. By neighbourhood.',
    slide1Cta: 'Continue →',
    slide2Headline: 'Tap any pin to see when sun arrives.',
    slide2Sub: 'Plan ahead. Filter by area. Find sun.',
    slide2Cta: "Let's go ☀",

    // Paywall trigger headlines + subheads
    paywallTimeScrubberHeadline: 'Drag to any hour',
    paywallTimeScrubberSub:
      'Scrub through the day and watch sun scores update live for every terrace.',
    paywallRatingsHeadline: "Today's hours & contact",
    paywallRatingsSub:
      'Live opening times, phone and website direct from Google, for every terrace.',
    paywallBusynessHeadline: 'See live busyness',
    paywallBusynessSub:
      "Know which terraces are quiet before you leave. Sunny and empty is the goal.",
    paywallPhotosHeadline: 'See terrace photos',
    paywallPhotosSub: 'Swipe through photos before making the trip.',
    paywallFavouritesHeadline: 'Save unlimited favourites',
    paywallFavouritesSub:
      "Save all your regular spots and get an alert when they're about to turn sunny.",
    paywallWidgetHeadline: 'Add a home screen widget',
    paywallWidgetSub: 'Top 3 sunniest terraces nearby, always visible at a glance.',
    paywallNotificationsHeadline: 'Get sunny-day alerts',
    paywallNotificationsSub:
      'A morning notification when tomorrow looks like a great terrace day.',
    paywallBestWindowHeadline: 'See the best visit window',
    paywallBestWindowSub:
      "We calculate the perfect 2–3 hour window for each terrace, so you don't have to.",
    paywallReservationsHeadline: 'Reserve a table instantly',
    paywallReservationsSub:
      "Book your spot in the sun in one tap — straight to the terrace's own reservation page.",
    paywallShareHeadline: 'Share a terrace card',
    paywallShareSub:
      'A beautiful card with sun score, best visit time, and Zonnie branding. Made for Stories.',
    paywallDefaultHeadline: 'Unlock Zonnie Pro',
    paywallDefaultSub:
      'The full Amsterdam sun experience — time scrubber, opening hours, photos, widget and more.',

    // Paywall feature bullets
    proFeature1: 'Time scrubber — drag to any hour',
    proFeature2: 'Terrace photos',
    proFeature3: 'Unlimited favourites',

    // Paywall tier labels
    tierMonthly: 'Monthly',
    tierMonthlyPeriod: 'per month',
    tierYearly: 'Yearly',
    tierYearlyPeriod: 'per year',
    tierLifetime: 'Lifetime',
    tierLifetimePeriod: 'once',
    bestDeal: 'Best value',
    tierMonthlyA11y: (price: string) => `Monthly plan, ${price} per month`,
    tierYearlyA11y: (price: string) => `Yearly plan, ${price} per year, best value`,
    tierLifetimeA11y: (price: string) => `Lifetime plan, ${price} once`,
    buyYearly: (price: string) => `Start for ${price}/yr`,
    buyMonthly: (price: string) => `Start for ${price}/mo`,
    buyLifetime: (price: string) => `Buy lifetime — ${price}`,
    buyYearlyA11y: 'Continue with yearly plan',
    buyMonthlyA11y: 'Continue with monthly plan',
    buyLifetimeA11y: 'Buy lifetime',
    legalText:
      'Subscriptions renew automatically. Cancel anytime in Settings. Payment charged to your Apple ID at confirmation.',
    termsOfUse: 'Terms of Use',
    privacyPolicy: 'Privacy Policy',
    restorePurchases: 'Restore purchases',
    restoreA11y: 'Restore previous purchases',
    alertNotAvailableTitle: 'Not available',
    alertNotAvailableBody: 'Store not available right now. Please try again in a moment.',
    alertPurchaseFailedTitle: 'Purchase failed',
    alertPurchaseFailedDefault: 'Something went wrong. Please try again.',
    alertRestoreFailedTitle: 'Restore failed',
    alertRestoreFailedDefault: 'Could not restore purchases. Please try again.',
    alertNoPurchasesTitle: 'No purchases found',
    alertNoPurchasesBody:
      'No previous Zonnie Pro purchase was found for this Apple ID.',
    alertOk: 'OK',
    closePaywall: 'Close',
    closePaywallA11y: 'Close',

    // Pro entry pill (TerraceList header) + subscribed state (ProPaywall)
    proEntryButton: '⭐ Zonnie Pro',
    proEntryActive: '⭐ Zonnie Pro ✓',
    proActiveTitle: 'You have Zonnie Pro',
    proActiveManageHint: 'Manage your subscription in iOS Settings',

    // Sun score legend (left-edge map overlay)
    legendTitle: 'Sun score',
    legendScorchio: 'Scorchio',
    legendScorchioSub: 'factor-50 weather',
    legendSunSoaked: 'Sun-soaked',
    legendSunSoakedSub: 'prime terrace time',
    legendDappled: 'Dappled',
    legendDappledSub: 'sun comes & goes',
    legendShady: 'Shady',
    legendShadySub: 'mostly in shadow',
    legendShadeCity: 'Shade city',
    legendShadeCitySub: 'bring a jumper',

    // Today's Verdict card
    verdictSectionLabel: 'TODAY',
    verdictHigh: '☀️ Cracking terrace day',
    verdictMid: '⛅ A few sunny spots',
    verdictLow: '☁️ Not really a terrace day',
    verdictLoading: 'Loading today\'s summary…',
    verdictStatLine: (count: number, fromHour: number, toHour: number) =>
      `${count} terraces above 65% between ${fromHour}:00–${toHour}:00`,
    verdictStatLineNoWindow: (count: number) =>
      `${count} ${count === 1 ? 'terrace' : 'terraces'} above 65% today`,
    verdictTopPicks: 'TOP PICKS TODAY',
    verdictFavouriteLine: (name: string, untilHour: number) =>
      `Your favourite: ${name} has sun till ${untilHour}:00`,

    // Chase the Sun crawl sheet
    chaseTheSun: 'Chase the sun',
    crawlSubtitle: (neighbourhood: string, stops: number, untilHour: number) =>
      `${neighbourhood} · ${stops} stops · sun till ${untilHour}:00`,
    crawlLeaveBy: (untilHour: number) =>
      `Leave stop 1 by ${untilHour}:00 to stay in the sun`,
    crawlSunChip: (fromHour: number, untilHour: number) =>
      `${fromHour}:00 – ${untilHour}:00 · in the sun`,
    crawlWalkConnector: (minutes: number, metres: number) =>
      `${minutes} min walk · ${metres} m`,
    crawlGoldenFinish: 'Golden-hour finish',
    crawlShareRoute: 'Share this sun route',
    crawlStart: 'Start',
    crawlShuffle: 'Shuffle',
    crawlNoRoute: 'No sunny route available from this terrace right now.',
    crawlShareText: (
      area: string,
      stop1name: string,
      stop1until: number,
      stop2name: string,
      stop2walk: number,
      stop3name: string,
      appUrl: string,
    ) =>
      `☀️ My Chase the Sun route through ${area}:\n1. ${stop1name} — sun till ${stop1until}:00\n2. ${stop2name} — ${stop2walk} min walk\n3. ${stop3name} — golden hour 🌅\n\nStay in the sun all afternoon → ${appUrl}`,
    crawlShareTextShort: (
      area: string,
      stop1name: string,
      stop1until: number,
      stop2name: string,
      stop2walk: number,
      appUrl: string,
    ) =>
      `☀️ My Chase the Sun route through ${area}:\n1. ${stop1name} — sun till ${stop1until}:00\n2. ${stop2name} — ${stop2walk} min walk 🌅\n\nStay in the sun all afternoon → ${appUrl}`,
    crawlChaseButton: '☀️ Chase the sun from here',
  },
} as const;

/**
 * The type of any fully-translated strings dictionary.
 * Using the union of both language objects means:
 *   1. TypeScript accepts `useStrings()` return value (which can be nl OR en)
 *      wherever `Strings` is expected.
 *   2. Accessing `t.someKey` still gives a string (union of two string literals),
 *      safe to render in JSX.
 *   3. Adding a key to nl but forgetting en still causes a compile error because
 *      the `en` object is checked against the shape of `nl` in the `strings`
 *      object literal.
 */
export type Strings = typeof strings.nl | typeof strings.en;
