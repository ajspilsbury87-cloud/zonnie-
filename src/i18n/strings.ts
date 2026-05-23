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
    filterBar: '🍺 Bar',
    filterRestaurant: '🍽️ Restaurant',
    filterCoffee: '☕ Koffie',
    filterOutdoor: '⚽ Buiten',
    filterNearMe: '📍 Dichtbij',
    filterMatch: '📺 Match',
    filterFavourites: '🤍 Favorieten',
    filterOutdoorA11y: 'Toon alleen terrassen met buitenschermen',
    filterNearMeA11y: 'Sorteer op dichtstbijzijnde zonnige plek',

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

    // Terrace detail sheet
    sunToday: 'Zon vandaag',
    bestVisitTime: 'Beste bezoektijd',
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

    // Landing page
    tagline: 'De zonnigste terrassen van Amsterdam',
    sunniestNow: 'NU ZONNIGST',
    seeAllTerraces: 'Alle terrassen bekijken',
    featured: 'Uitgelicht',

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
    paywallShareHeadline: 'Deel een terraskaartje',
    paywallShareSub:
      'Een mooi kaartje met zonscore, beste bezoekmoment en Zonnie-branding. Gemaakt voor Stories.',
    paywallDefaultHeadline: 'Zonnie Pro vrijschakelen',
    paywallDefaultSub:
      "De volledige Amsterdam-zonervaring — tijdschuifregelaar, openingstijden, foto's, widget en meer.",

    // Paywall feature bullets
    proFeature1: 'Tijdschuifregelaar — versleep naar elk uur',
    proFeature2: 'Google-beoordelingen direct in beeld',
    proFeature3: 'Onbeperkte favorieten + pushmeldingen',

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
    filterBar: '🍺 Bar',
    filterRestaurant: '🍽️ Restaurant',
    filterCoffee: '☕ Coffee',
    filterOutdoor: '⚽ Outdoor',
    filterNearMe: '📍 Near me',
    filterMatch: '📺 Match',
    filterFavourites: '🤍 Favourites',
    filterOutdoorA11y: 'Show only terraces with outdoor screens',
    filterNearMeA11y: 'Sort by nearest sunny spot',

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

    // Terrace detail sheet
    sunToday: 'Sun today',
    bestVisitTime: 'Best time to visit',
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

    // Landing page
    tagline: 'The sunniest terraces in Amsterdam',
    sunniestNow: 'SUNNIEST RIGHT NOW',
    seeAllTerraces: 'See all terraces',
    featured: 'Featured',

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
    paywallShareHeadline: 'Share a terrace card',
    paywallShareSub:
      'A beautiful card with sun score, best visit time, and Zonnie branding. Made for Stories.',
    paywallDefaultHeadline: 'Unlock Zonnie Pro',
    paywallDefaultSub:
      'The full Amsterdam sun experience — time scrubber, opening hours, photos, widget and more.',

    // Paywall feature bullets
    proFeature1: 'Time scrubber — drag to any hour',
    proFeature2: 'Google ratings inline',
    proFeature3: 'Unlimited favourites + push alerts',

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
  },
} as const;

export type Strings = typeof strings.nl;
