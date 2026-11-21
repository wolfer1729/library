// Front (welcome) page. A classic script (not a module) so the page also works when opened as a file.
(function () {
  'use strict';

  var STR = {
    en: {
      appName: 'Granthalaya',
      docTitle: 'Granthalaya Library',
      navLanguages: 'Languages',
      navFeatured: 'Featured',
      navGenres: 'Genres',
      navHow: 'How it works',
      openLibrary: 'Open the library',
      addOwn: 'Add your own book',
      eyebrow: 'A free library in three languages',
      heroTitle: 'Read the world’s great books in <em>English, हिन्दी &amp; తెలుగు</em>',
      heroSub: 'Famous novels, story collections and children’s tales, sorted by genre. Read them in your browser, listen to narrated audiobooks, or let your device read any book aloud, even the ones you add yourself.',
      statBooks: 'books & stories',
      statReadable: 'free to read now',
      statLanguages: 'languages',
      statGenres: 'genres',
      langTitle: 'Choose your language',
      langSub: 'Every book is shelved by language and genre. Pick a language to start browsing.',
      langCount: '{n} books · {r} free to read',
      featuredTitle: 'Start with a classic',
      featuredSub: 'A few favourites from each language.',
      seeAll: 'See the whole library →',
      featuresTitle: 'Read, listen, or add your own',
      f1t: 'Read anywhere',
      f1d: 'Chapters, adjustable text size, and paper, sepia or night themes. The library remembers where you stopped.',
      f2t: 'Narrated audiobooks',
      f2d: 'English classics come with free recordings read by LibriVox volunteers. The player keeps going while you browse.',
      f3t: 'Read aloud in any language',
      f3d: 'Your device reads any book aloud in English, Hindi or Telugu, highlighting each paragraph as it goes.',
      f4t: 'Add your own books',
      f4d: 'Upload EPUB, PDF or TXT novels, with audiobook files if you have them. They join the right genre shelf.',
      genresTitle: 'Browse by genre',
      sourcesTitle: 'Where the books come from',
      srcGutenberg: 'English classics that are in the public domain.',
      srcWikisourceName: 'Wikisource',
      srcWikisource: 'Hindi and Telugu literature, typed in by volunteers.',
      srcLibrivox: 'Free audiobooks read by volunteers.',
      srcVoicesName: 'Your browser',
      srcVoices: 'Built-in voices for reading aloud. Microsoft Edge has natural Hindi and Telugu voices.',
      copyrightNote: 'Famous modern books that are still under copyright are listed as “Catalogue”. Their text isn’t included, but you can add a copy you own and read or listen to it here.',
      ctaTitle: 'Your library is open',
      ctaSub: 'Pick a book, or bring your own.',
      footerLine: 'Granthalaya: a personal library for English, हिन्दी and తెలుగు books.',
      serverTitle: 'Start the library first.',
      serverHelp: 'This page was opened as a file, so books can’t load yet. Double-click <code>start.bat</code> in the library folder (or run <code>npm start</code>), then open <code>http://localhost:3000</code>.',
      openLocalhost: 'Open localhost:3000',
      uiLanguage: 'App language',
      toggleTheme: 'Light / dark theme',
      catalogue: 'Catalogue',
    },
    hi: {
      appName: 'ग्रंथालय',
      docTitle: 'ग्रंथालय',
      navLanguages: 'भाषाएँ',
      navFeatured: 'चुनिंदा',
      navGenres: 'विधाएँ',
      navHow: 'कैसे काम करता है',
      openLibrary: 'ग्रंथालय खोलें',
      addOwn: 'अपनी किताब जोड़ें',
      eyebrow: 'तीन भाषाओं का मुफ़्त पुस्तकालय',
      heroTitle: 'दुनिया की महान किताबें पढ़िए, <em>English, हिन्दी और తెలుగు</em> में',
      heroSub: 'प्रसिद्ध उपन्यास, कहानी-संग्रह और बाल कथाएँ, विधा के अनुसार सजी हुई। ब्राउज़र में पढ़ें, ऑडियोबुक सुनें, या कोई भी किताब अपने डिवाइस से ज़ोर से पढ़वाएँ, अपनी जोड़ी हुई किताबें भी।',
      statBooks: 'किताबें और कहानियाँ',
      statReadable: 'अभी मुफ़्त पढ़ें',
      statLanguages: 'भाषाएँ',
      statGenres: 'विधाएँ',
      langTitle: 'अपनी भाषा चुनें',
      langSub: 'हर किताब भाषा और विधा के अनुसार रखी गई है। देखना शुरू करने के लिए एक भाषा चुनें।',
      langCount: '{n} किताबें · {r} मुफ़्त पढ़ें',
      featuredTitle: 'किसी क्लासिक से शुरुआत करें',
      featuredSub: 'हर भाषा से कुछ पसंदीदा किताबें।',
      seeAll: 'पूरा ग्रंथालय देखें →',
      featuresTitle: 'पढ़ें, सुनें, या अपनी किताब जोड़ें',
      f1t: 'कहीं भी पढ़ें',
      f1d: 'अध्याय, बदलने योग्य अक्षर, और काग़ज़, सीपिया या रात की थीम। आप जहाँ रुके थे, ग्रंथालय वहीं से शुरू करता है।',
      f2t: 'ऑडियोबुक',
      f2d: 'अंग्रेज़ी क्लासिक्स के साथ LibriVox के स्वयंसेवकों की मुफ़्त रिकॉर्डिंग। ब्राउज़ करते समय भी प्लेयर चलता रहता है।',
      f3t: 'किसी भी भाषा में ज़ोर से पढ़वाएँ',
      f3d: 'आपका डिवाइस कोई भी किताब अंग्रेज़ी, हिन्दी या तेलुगु में पढ़कर सुनाता है, हर अनुच्छेद को चिह्नित करते हुए।',
      f4t: 'अपनी किताबें जोड़ें',
      f4d: 'EPUB, PDF या TXT उपन्यास अपलोड करें, चाहें तो ऑडियोबुक फ़ाइलों के साथ। वे सही विधा की अलमारी में जुड़ जाते हैं।',
      genresTitle: 'विधा के अनुसार देखें',
      sourcesTitle: 'किताबें कहाँ से आती हैं',
      srcGutenberg: 'सार्वजनिक डोमेन की अंग्रेज़ी क्लासिक किताबें।',
      srcWikisourceName: 'विकिस्रोत',
      srcWikisource: 'स्वयंसेवकों द्वारा टाइप किया गया हिन्दी और तेलुगु साहित्य।',
      srcLibrivox: 'स्वयंसेवकों द्वारा पढ़ी गई मुफ़्त ऑडियोबुक।',
      srcVoicesName: 'आपका ब्राउज़र',
      srcVoices: 'ज़ोर से पढ़ने के लिए ब्राउज़र की आवाज़ें। Microsoft Edge में हिन्दी और तेलुगु की नैचुरल आवाज़ें हैं।',
      copyrightNote: 'जो प्रसिद्ध आधुनिक किताबें अभी कॉपीराइट में हैं, वे “सूची में” के रूप में दिखती हैं। उनका पाठ शामिल नहीं है, पर आप अपनी प्रति जोड़कर उसे यहाँ पढ़ और सुन सकते हैं।',
      ctaTitle: 'आपका ग्रंथालय खुला है',
      ctaSub: 'कोई किताब चुनें, या अपनी लाएँ।',
      footerLine: 'ग्रंथालय: English, हिन्दी और తెలుగు किताबों का निजी पुस्तकालय।',
      serverTitle: 'पहले ग्रंथालय शुरू करें।',
      serverHelp: 'यह पेज फ़ाइल के रूप में खोला गया है, इसलिए किताबें अभी नहीं खुलेंगी। ग्रंथालय फ़ोल्डर में <code>start.bat</code> पर डबल-क्लिक करें (या <code>npm start</code> चलाएँ), फिर <code>http://localhost:3000</code> खोलें।',
      openLocalhost: 'localhost:3000 खोलें',
      uiLanguage: 'ऐप की भाषा',
      toggleTheme: 'लाइट / डार्क थीम',
      catalogue: 'सूची में',
    },
    te: {
      appName: 'గ్రంథాలయం',
      docTitle: 'గ్రంథాలయం',
      navLanguages: 'భాషలు',
      navFeatured: 'ఎంపికలు',
      navGenres: 'విభాగాలు',
      navHow: 'ఎలా పనిచేస్తుంది',
      openLibrary: 'గ్రంథాలయం తెరవండి',
      addOwn: 'మీ పుస్తకం చేర్చండి',
      eyebrow: 'మూడు భాషల ఉచిత గ్రంథాలయం',
      heroTitle: 'ప్రపంచ గొప్ప పుస్తకాలను <em>English, हिन्दी, తెలుగు</em> భాషల్లో చదవండి',
      heroSub: 'ప్రసిద్ధ నవలలు, కథా సంకలనాలు, పిల్లల కథలు, విభాగాల వారీగా. బ్రౌజర్‌లోనే చదవండి, ఆడియోబుక్స్ వినండి, లేదా ఏ పుస్తకాన్నైనా మీ పరికరంతో గట్టిగా చదివించుకోండి, మీరు చేర్చిన పుస్తకాలను కూడా.',
      statBooks: 'పుస్తకాలు & కథలు',
      statReadable: 'ఇప్పుడే ఉచితంగా చదవొచ్చు',
      statLanguages: 'భాషలు',
      statGenres: 'విభాగాలు',
      langTitle: 'మీ భాషను ఎంచుకోండి',
      langSub: 'ప్రతి పుస్తకం భాష, విభాగం ప్రకారం అమర్చబడింది. చూడటం మొదలుపెట్టడానికి ఒక భాషను ఎంచుకోండి.',
      langCount: '{n} పుస్తకాలు · {r} ఉచితంగా చదవొచ్చు',
      featuredTitle: 'ఒక క్లాసిక్‌తో మొదలుపెట్టండి',
      featuredSub: 'ప్రతి భాష నుంచి కొన్ని ఇష్టమైన పుస్తకాలు.',
      seeAll: 'మొత్తం గ్రంథాలయం చూడండి →',
      featuresTitle: 'చదవండి, వినండి, లేదా మీ పుస్తకం చేర్చండి',
      f1t: 'ఎక్కడైనా చదవండి',
      f1d: 'అధ్యాయాలు, అక్షర పరిమాణం, కాగితం, సెపియా లేదా రాత్రి థీమ్‌లు. మీరు ఎక్కడ ఆపారో గ్రంథాలయం గుర్తుంచుకుంటుంది.',
      f2t: 'ఆడియోబుక్స్',
      f2d: 'ఇంగ్లీష్ క్లాసిక్స్‌కు LibriVox స్వచ్ఛంద సేవకులు చదివిన ఉచిత రికార్డింగ్‌లు. మీరు బ్రౌజ్ చేస్తున్నా ప్లేయర్ ఆగదు.',
      f3t: 'ఏ భాషలోనైనా గట్టిగా చదివించుకోండి',
      f3d: 'మీ పరికరం ఏ పుస్తకాన్నైనా ఇంగ్లీష్, హిందీ లేదా తెలుగులో చదివి వినిపిస్తుంది, ప్రతి పేరాను హైలైట్ చేస్తూ.',
      f4t: 'మీ పుస్తకాలు చేర్చండి',
      f4d: 'EPUB, PDF లేదా TXT నవలలను అప్‌లోడ్ చేయండి, ఉంటే ఆడియోబుక్ ఫైళ్ళతో సహా. అవి సరైన విభాగంలో చేరతాయి.',
      genresTitle: 'విభాగాల వారీగా చూడండి',
      sourcesTitle: 'పుస్తకాలు ఎక్కడి నుంచి వస్తాయి',
      srcGutenberg: 'పబ్లిక్ డొమైన్‌లోని ఇంగ్లీష్ క్లాసిక్స్.',
      srcWikisourceName: 'వికీసోర్స్',
      srcWikisource: 'స్వచ్ఛంద సేవకులు టైప్ చేసిన తెలుగు, హిందీ సాహిత్యం.',
      srcLibrivox: 'స్వచ్ఛంద సేవకులు చదివిన ఉచిత ఆడియోబుక్స్.',
      srcVoicesName: 'మీ బ్రౌజర్',
      srcVoices: 'గట్టిగా చదవడానికి బ్రౌజర్ గొంతులు. Microsoft Edgeలో సహజమైన తెలుగు, హిందీ గొంతులు ఉన్నాయి.',
      copyrightNote: 'ఇంకా కాపీరైట్‌లో ఉన్న ప్రసిద్ధ ఆధునిక పుస్తకాలు “జాబితాలో” అని కనిపిస్తాయి. వాటి పాఠ్యం చేర్చలేదు, కానీ మీ దగ్గర ఉన్న ప్రతిని చేర్చి ఇక్కడ చదవవచ్చు, వినవచ్చు.',
      ctaTitle: 'మీ గ్రంథాలయం తెరిచే ఉంది',
      ctaSub: 'ఒక పుస్తకం ఎంచుకోండి, లేదా మీది తీసుకురండి.',
      footerLine: 'గ్రంథాలయం: English, हिन्दी, తెలుగు పుస్తకాల వ్యక్తిగత గ్రంథాలయం.',
      serverTitle: 'ముందుగా గ్రంథాలయాన్ని ప్రారంభించండి.',
      serverHelp: 'ఈ పేజీని ఫైల్‌గా తెరిచారు, అందుకే పుస్తకాలు ఇంకా తెరుచుకోవు. గ్రంథాలయం ఫోల్డర్‌లో <code>start.bat</code> పై డబుల్-క్లిక్ చేయండి (లేదా <code>npm start</code> నడపండి), తర్వాత <code>http://localhost:3000</code> తెరవండి.',
      openLocalhost: 'localhost:3000 తెరవండి',
      uiLanguage: 'యాప్ భాష',
      toggleTheme: 'లైట్ / డార్క్ థీమ్',
      catalogue: 'జాబితాలో',
    },
  };

  var UI_LANGS = [
    { id: 'en', short: 'EN', name: 'English' },
    { id: 'hi', short: 'हिं', name: 'हिन्दी' },
    { id: 'te', short: 'తె', name: 'తెలుగు' },
  ];

  // Same as data/catalog/genres.json; replaced by the live list when the server is running.
  var GENRES = [
    { id: 'classics', en: 'Classics', hi: 'क्लासिक', te: 'క్లాసిక్స్' },
    { id: 'social', en: 'Social & Realist', hi: 'सामाजिक उपन्यास', te: 'సాంఘిక నవలలు' },
    { id: 'romance', en: 'Romance', hi: 'प्रेम कथाएँ', te: 'ప్రేమ కథలు' },
    { id: 'mystery', en: 'Mystery & Detective', hi: 'रहस्य और जासूसी', te: 'మిస్టరీ & డిటెక్టివ్' },
    { id: 'adventure', en: 'Adventure', hi: 'साहसिक', te: 'సాహస కథలు' },
    { id: 'historical', en: 'Historical', hi: 'ऐतिहासिक', te: 'చారిత్రక నవలలు' },
    { id: 'short-stories', en: 'Short Stories', hi: 'कहानियाँ', te: 'కథానికలు' },
    { id: 'children', en: "Children's", hi: 'बाल साहित्य', te: 'పిల్లల కథలు' },
    { id: 'folk', en: 'Folk Tales & Fables', hi: 'लोककथाएँ और नीतिकथाएँ', te: 'జానపద & నీతి కథలు' },
    { id: 'fantasy', en: 'Fantasy', hi: 'फंतासी और तिलिस्म', te: 'ఫాంటసీ & అద్భుత కథలు' },
    { id: 'scifi', en: 'Science Fiction', hi: 'विज्ञान कथा', te: 'సైన్స్ ఫిక్షన్' },
    { id: 'horror', en: 'Horror & Gothic', hi: 'डरावनी कहानियाँ', te: 'భయానక కథలు' },
    { id: 'humor', en: 'Humour & Satire', hi: 'हास्य-व्यंग्य', te: 'హాస్యం & వ్యంగ్యం' },
    { id: 'drama', en: 'Plays & Drama', hi: 'नाटक', te: 'నాటకాలు' },
    { id: 'poetry', en: 'Poetry', hi: 'कविता', te: 'కవిత్వం' },
    { id: 'epics', en: 'Epics & Mythology', hi: 'महाकाव्य और पुराण', te: 'ఇతిహాసాలు & పురాణాలు' },
    { id: 'philosophy', en: 'Spiritual & Philosophical', hi: 'आध्यात्मिक और दार्शनिक', te: 'ఆధ్యాత్మికం & తాత్వికం' },
  ];

  // Cover colours: identical to js/covers.js so books look the same on both pages.
  var PALETTES = {
    classics: [['#4a1717', '#7f2a2a'], ['#1b2f4d', '#2c4c78'], ['#1f3a2a', '#2f5c42'], ['#3a2a1a', '#6b4a2a']],
    social: [['#20403f', '#33615f'], ['#3b2f4a', '#5a4870'], ['#4a3418', '#7a5527']],
    romance: [['#6e1a35', '#a8395c'], ['#7c2f3c', '#b85d6a'], ['#5a1f4a', '#8e3d78']],
    mystery: [['#1a2233', '#34425f'], ['#222', '#474747'], ['#23313a', '#3d5563']],
    adventure: [['#2c4a1f', '#4f7a33'], ['#5a3a12', '#93622a'], ['#123f4a', '#1f6a7a']],
    historical: [['#4d3315', '#80562a'], ['#3d2a20', '#6b4b3a'], ['#4a2c12', '#7d4a1d']],
    'short-stories': [['#2d3f54', '#4b6584'], ['#3f4b2e', '#64784a'], ['#4b2e3f', '#784a65']],
    children: [['#b8571c', '#e58a3a'], ['#2f7d5c', '#4fae86'], ['#3a63a8', '#5e8ad6'], ['#a8402f', '#d86b55']],
    folk: [['#8a3b12', '#c2652a'], ['#6b4a12', '#a8782a'], ['#2e5a4a', '#4b8a70']],
    fantasy: [['#2b1d4f', '#53379a'], ['#123a4f', '#2a6f8f'], ['#4a1d4f', '#7e3a86']],
    scifi: [['#0f2f3f', '#1d5b73'], ['#151a3a', '#2c3a7a'], ['#0f3a33', '#1f6b5e']],
    horror: [['#1a0d0d', '#4a1414'], ['#141414', '#3a2020'], ['#16141f', '#3a2a4a']],
    humor: [['#a8741a', '#d9a23a'], ['#2f6b8a', '#4f97b8'], ['#8a3a5a', '#bb5f84']],
    drama: [['#3f1a4a', '#6b2f7a'], ['#4a1a2a', '#7a2f48']],
    poetry: [['#4a2a4a', '#7a4d7a'], ['#2a3f4a', '#4d6b7a'], ['#5a3a2a', '#8a5f48']],
    epics: [['#7a4a0f', '#b8801f'], ['#5a2a0f', '#94501f'], ['#6b1f1f', '#a83a2a']],
    philosophy: [['#2a3a3a', '#4a6464'], ['#3a3020', '#665536']],
  };
  var ORNAMENTS = { classics: '❦', romance: '❤', mystery: '◈', adventure: '✦', historical: '♜', children: '✿', folk: '❀', fantasy: '✧', scifi: '✺', horror: '☾', humor: '☺', drama: '♣', poetry: '❧', epics: '☀', philosophy: '☯', social: '❖', 'short-stories': '✎' };

  // Hand-picked favourites (all are free to read in the library).
  var FEATURED = [
    { id: 'en-pride-and-prejudice', title: 'Pride and Prejudice', author: 'Jane Austen', lang: 'en', genres: ['romance'] },
    { id: 'hi-godaan', title: 'गोदान', author: 'प्रेमचंद', lang: 'hi', genres: ['social'] },
    { id: 'te-kanyasulkam', title: 'కన్యాశుల్కము', author: 'గురజాడ అప్పారావు', lang: 'te', genres: ['drama'] },
    { id: 'en-adventures-of-sherlock-holmes', title: 'The Adventures of Sherlock Holmes', author: 'Arthur Conan Doyle', lang: 'en', genres: ['mystery'] },
    { id: 'hi-idgah', title: 'ईदगाह', author: 'प्रेमचंद', lang: 'hi', genres: ['short-stories'] },
    { id: 'te-ganapati', title: 'గణపతి', author: 'చిలకమర్తి లక్ష్మీనరసింహం', lang: 'te', genres: ['humor'] },
    { id: 'en-gitanjali', title: 'Gitanjali', author: 'Rabindranath Tagore', lang: 'en', genres: ['poetry'] },
    { id: 'hi-nirmala', title: 'निर्मला', author: 'प्रेमचंद', lang: 'hi', genres: ['social'] },
    { id: 'te-himabindu', title: 'హిమబిందు', author: 'అడివి బాపిరాజు', lang: 'te', genres: ['historical'] },
    { id: 'en-jungle-book', title: 'The Jungle Book', author: 'Rudyard Kipling', lang: 'en', genres: ['children'] },
    { id: 'hi-vaishali-ki-nagarvadhu', title: 'वैशाली की नगरवधू', author: 'आचार्य चतुरसेन शास्त्री', lang: 'hi', genres: ['historical'] },
    { id: 'te-kasi-majili-1', title: 'కాశీమజిలీకథలు (మొదటి భాగము)', author: 'మధిర సుబ్బన్న దీక్షితులు', lang: 'te', genres: ['folk'] },
  ];
  var HERO = ['en-pride-and-prejudice', 'hi-godaan', 'te-kanyasulkam'];

  // Counts when the server can't be reached (kept in sync with the catalogue).
  var counts = { total: 281, readable: 239, genres: 17, langs: { en: [167, 151], hi: [68, 54], te: [46, 34] }, perGenre: null };

  var isFile = location.protocol === 'file:';
  var LANG_BADGE = { en: 'EN', hi: 'हिं', te: 'తె' };

  // ---------------------------------------------------------------- helpers
  function load(key, fallback) {
    try {
      var v = localStorage.getItem(key);
      return v == null ? fallback : JSON.parse(v);
    } catch (e) {
      return fallback;
    }
  }
  function save(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      /* storage unavailable */
    }
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function hashStr(s) {
    var h = 2166136261;
    for (var i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }
  function $(sel, root) {
    return (root || document).querySelector(sel);
  }
  function $$(sel, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(sel));
  }

  function initialLang() {
    var saved = load('uiLang', null);
    if (STR[saved]) return saved;
    var nav = (navigator.language || 'en').slice(0, 2).toLowerCase();
    return STR[nav] ? nav : 'en';
  }
  var ui = initialLang();

  function t(key, vars) {
    var s = STR[ui][key] != null ? STR[ui][key] : STR.en[key];
    if (s == null) return key;
    if (vars) s = s.replace(/\{(\w+)\}/g, function (m, k) { return k in vars ? vars[k] : m; });
    return s;
  }

  function isDark() {
    var th = document.documentElement.dataset.theme;
    return th ? th === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
  }

  /** Link into the library app. Opened as a file, links point at the local server instead. */
  function libUrl(path) {
    var base = isFile ? 'http://localhost:3000/library.html' : 'library.html';
    var hash = path || '';
    if (isFile) hash = (hash || '/') + (hash.indexOf('?') >= 0 ? '&' : '?') + 'ui=' + ui;
    return base + (hash ? '#' + hash : '');
  }

  function coverHTML(book) {
    var genre = (book.genres || [])[0] || 'classics';
    var pal = PALETTES[genre] || PALETTES.classics;
    var c = pal[hashStr(book.id + book.title) % pal.length];
    var lang = book.lang === 'hi' || book.lang === 'te' ? book.lang : 'en';
    var words = book.title.split(/\s+/).map(function (w) { return Array.from(w).length; });
    var longest = Math.max.apply(null, words);
    var size = longest > 11 ? ' xlong' : Array.from(book.title).length > 26 || longest > 8 ? ' long' : '';
    return (
      '<div class="cover cover-gen" style="--c1:' + c[0] + ';--c2:' + c[1] + '">' +
      '<div class="cover-frame">' +
      '<div class="cover-orn" aria-hidden="true">' + (ORNAMENTS[genre] || '❦') + '</div>' +
      '<div class="cover-title' + size + '" lang="' + lang + '">' + esc(book.title) + '</div>' +
      '<div class="cover-rule"></div>' +
      '<div class="cover-author" lang="' + lang + '">' + esc(book.author || '') + '</div>' +
      '</div></div>'
    );
  }

  var ICON_SUN = '<svg class="i" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';
  var ICON_MOON = '<svg class="i" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>';

  // ---------------------------------------------------------------- rendering
  function renderText() {
    document.documentElement.lang = ui;
    document.title = t('docTitle');
    $$('[data-t]').forEach(function (el) { el.textContent = t(el.getAttribute('data-t')); });
    $$('[data-th]').forEach(function (el) { el.innerHTML = t(el.getAttribute('data-th')); });
    $$('[data-t-title]').forEach(function (el) {
      var s = t(el.getAttribute('data-t-title'));
      el.title = s;
      el.setAttribute('aria-label', s);
    });

    var seg = $('[data-ui-seg]');
    seg.setAttribute('aria-label', t('uiLanguage'));
    seg.innerHTML = UI_LANGS.map(function (l) {
      return '<button type="button" data-ui="' + l.id + '" lang="' + l.id + '" title="' + esc(l.name) + '" aria-pressed="' + (l.id === ui) + '">' + esc(l.short) + '</button>';
    }).join('');

    var themeBtn = $('[data-theme-toggle]');
    themeBtn.innerHTML = isDark() ? ICON_SUN : ICON_MOON;
    themeBtn.title = t('toggleTheme');
    themeBtn.setAttribute('aria-label', t('toggleTheme'));
  }

  function renderCounts() {
    $$('[data-stat]').forEach(function (el) { el.textContent = counts[el.getAttribute('data-stat')]; });
    $$('[data-lang-count]').forEach(function (el) {
      var c = counts.langs[el.getAttribute('data-lang-count')];
      el.textContent = t('langCount', { n: c[0], r: c[1] });
    });
  }

  function renderBooks() {
    var byId = {};
    FEATURED.forEach(function (b) { byId[b.id] = b; });
    $('[data-hero-covers]').innerHTML = HERO.map(function (id) { return coverHTML(byId[id]); }).join('');
    $('[data-featured]').innerHTML = FEATURED.map(function (b) {
      var lang = b.lang === 'hi' || b.lang === 'te' ? b.lang : 'en';
      return (
        '<a class="card" href="' + esc(libUrl('/book/' + encodeURIComponent(b.id))) + '">' +
        coverHTML(b) +
        '<div class="card-title" lang="' + lang + '">' + esc(b.title) + '</div>' +
        '<div class="card-author" lang="' + lang + '">' + esc(b.author) + '</div>' +
        '<div class="badges"><span class="badge">' + LANG_BADGE[b.lang] + '</span></div>' +
        '</a>'
      );
    }).join('');
  }

  function renderGenres() {
    $('[data-genres]').innerHTML = GENRES.map(function (g) {
      var c = (PALETTES[g.id] || PALETTES.classics)[0];
      var n = counts.perGenre ? counts.perGenre[g.id] || 0 : null;
      return (
        '<a class="f-genre" href="' + esc(libUrl('/genre/' + g.id)) + '">' +
        '<span class="orn" style="--c1:' + c[0] + ';--c2:' + c[1] + '" aria-hidden="true">' + (ORNAMENTS[g.id] || '❦') + '</span>' +
        '<span class="name">' + esc(g[ui] || g.en) + '</span>' +
        (n != null ? '<span class="n">' + n + '</span>' : '') +
        '</a>'
      );
    }).join('');
  }

  function renderLinks() {
    $$('[data-lib]').forEach(function (a) { a.href = libUrl(a.getAttribute('data-lib')); });
  }

  function renderAll() {
    renderText();
    renderCounts();
    renderBooks();
    renderGenres();
    renderLinks();
  }

  // ---------------------------------------------------------------- events
  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-ui]');
    if (b) {
      ui = b.getAttribute('data-ui');
      save('uiLang', ui);
      renderAll();
      return;
    }
    if (e.target.closest('[data-theme-toggle]')) {
      var next = isDark() ? 'light' : 'dark';
      document.documentElement.dataset.theme = next;
      save('appTheme', next);
      renderText();
    }
  });

  if (isFile) $('[data-file-banner]').hidden = false;

  renderAll();

  // ---------------------------------------------------------------- live numbers
  if (!isFile && window.fetch) {
    // With the server running: /api/catalog. On the website version (GitHub Pages): books/catalog.json.
    var getJSON = function (url) {
      return fetch(url).then(function (r) {
        if (!r.ok || (r.headers.get('content-type') || '').indexOf('json') < 0) throw new Error(r.status);
        return r.json();
      });
    };
    getJSON('api/catalog')
      .catch(function () {
        var secure = location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1';
        if ('serviceWorker' in navigator && secure) navigator.serviceWorker.register('sw.js').catch(function () {});
        return getJSON('books/catalog.json');
      })
      .then(function (data) {
        var books = data.books || [];
        var live = { total: books.length, readable: 0, genres: (data.genres || []).length, langs: { en: [0, 0], hi: [0, 0], te: [0, 0] }, perGenre: {} };
        books.forEach(function (b) {
          if (b.hasText) live.readable++;
          if (live.langs[b.lang]) {
            live.langs[b.lang][0]++;
            if (b.hasText) live.langs[b.lang][1]++;
          }
          (b.genres || []).forEach(function (g) { live.perGenre[g] = (live.perGenre[g] || 0) + 1; });
        });
        counts = live;
        if (data.genres && data.genres.length) GENRES = data.genres;
        var map = {};
        books.forEach(function (b) { map[b.id] = b; });
        FEATURED = FEATURED.map(function (f) { return map[f.id] || f; });
        renderCounts();
        renderBooks();
        renderGenres();
      })
      .catch(function () { /* keep the built-in numbers */ });
  }
})();
