/* PrepLine by Autoprod: prep start days by ingredient type (4.6.2 / 4.8.13 / 4.8.24 / 4.8.25 / 4.8.26).
 * EDIT THIS FILE to change the rules. Each category has:
 *   lead   - how many days BEFORE the event/function day the job starts (0 = on the day)
 *   weekendShift - if true, Sat/Sun starts use weekend avoidance (forward Mon / back Fri).
 *                  4.6.2: weekend avoidance applies to ALL categories when the Rules
 *                  profile toggle is on; this flag still seeds per-rule defaults.
 *   batchWindow - max days from batch prep day to latest member use (protein = 4, fish/seafood = 2, prawn = 1)
 *   legend / words - matching (first match wins; specific before general)
 *
 * Protein stages (Gerard): redmeat prep START lead=4 (day4 collect/trim … event box off).
 *   Poultry lead=3 (4.8.26 — overrides general 4-day protein).
 * Seafood / fish (Gerard 4.8.13): lead=2, batchWindow=2 —
 *   day 2 before = collect & trim; day 1 before = process / count / tray up.
 * Prawns (Gerard 4.8.24): lead=1, batchWindow=1, not cross-batched —
 *   Paula orders prawns the day before the event for freshness; prep 1 day before only.
 *   Must not be pulled earlier via Mon/Sat batching. Crab croquettes stay 4-day (crabcroq).
 * Veg (Gerard 4.8.25): named soft=2 / hard=4 lists replace generic collect/cook split for those items.
 *   Soft: zucchini(+flower), radish, sauteed warrigal, shaved fennel, celeriac remoulade, apple.
 *   Hard: carrots, pickled veg, onions, beetroot, pumpkin, sweet potato, parsnip, potato, leeks,
 *   pencil leek, turnips, roasted/sous-vide fennel, gem lettuce, witlof, picked leaves, flowers,
 *   edible/garlic flowers, iceplant, samphire, karkalla, seablight, picked warrigal.
 *   Specificity: sauteed warrigal=2 vs picked warrigal=4; shaved fennel=2 vs roasted/sous vide=4.
 *   Micro herbs: lead=1, not early-batched. Unlisted veg still use vegraw≤4 / vegcook≤3 fallback.
 * 4.8.26 Paula long-life: dressings, any croutons, powders, crumbs, oils, soils, gels (e.g. Yuzu Gel)
 *   — made once ≤4 days before first event of the week; covers whole week.
 *   ANY puree = lead 2 only (no earlier / long-life batching; overrides gels window), e.g. Pea + Tarragon Puree.
 *   Poultry lead=3 (overrides general 4-day protein). Cheese lead=3. Dressings & butters stay 4.
 */

window.PREP_DAYS_VOCAB = [
  {key:'micro',   label:'Micro herbs (1 day)',     lead:1, batchWindow:1, weekendShift:true, family:'garnish',
   legend:['micro herbs','micro greens','micro herb','micros','micro'],
   words:['micro*','tendril*','sprout*','cress','shoots','pea shoots','baby herbs']},
  {key:'dry',     label:'Dry garnish and crumbs',  lead:4, batchWindow:4, weekendShift:true, family:'garnish',
   legend:['dry garnish','dry garnishes','dry garnish crumbs','dry garnishes crumbs','crumbs','crumb','dry','powders','powder'],
   words:['crumb*','crouton*','crumble','panko','dukkah','dukka','praline','tuile*','crisp*','chip','chips','powder','dust','soil','granola','toasted seeds','toasted nuts','candied nuts','seeds','furikake']},
  {key:'oil',     label:'Oils',                    lead:4, batchWindow:4, weekendShift:true, family:'garnish',
   legend:['oil','oils'],
   words:['oil','oils','chilli oil','herb oil','green oil']},
  /* 4.8.26: puree lead=2 no long-life; gels stay 3 but long-life packs whole week ≤4 before first event */
  {key:'puree',   label:'Purees (2 days)',           lead:2, batchWindow:2, weekendShift:true, family:'sauce',
   legend:['puree','purees'],
   words:['puree*','purée*','pureed']},
  {key:'gels',    label:'Gels and sauces',         lead:3, batchWindow:3, weekendShift:true, family:'sauce',
   legend:['gel','gels','sauce','sauces','sauce puree gels','sauces purees gels'],
   words:['gel*','coulis','fluid gel','jelly','butter glaze','glaze','romesco','reduction','jus','gravy','salsa','relish','chutney','ragu','ragout','ponzu','cashew cream','cream flora','flora cream']},
  /* 4.8.24: prawns before seafood so keyword match wins (lead 1, no early batching). */
  {key:'prawn',   label:'Prawns (order day-before)', lead:1, batchWindow:1, weekendShift:true, family:'protein',
   legend:['prawn','prawns','shrimp'],
   words:['prawn*','shrimp*']},
  {key:'seafood', label:'Seafood',                 lead:2, batchWindow:2, weekendShift:true, family:'protein',
   legend:['seafood','fish','shellfish'],
   words:['seafood','fish','salmon','tuna','scallop*','barramundi','kingfish','hiramasa','snapper','cod','crab','lobster','octopus','squid','calamari','mussel*','oyster*','clam*','bug','bugs','trout','ling','mackerel','sardine*','anchov*','swordfish','whiting','flathead','john dory','bream','caviar','hake','flake','mullet','garfish','ocean trout','coral trout','blue eye','blueeye','pipi*','yabby*','marron','eel','langoustine*','crayfish','dory']},
  {key:'redmeat', label:'Red meat',                lead:4, batchWindow:4, weekendShift:true, family:'protein',
   legend:['red meat','red meats','meat','beef','lamb','pork'],
   words:['beef','lamb','pork','veal','venison','wagyu','brisket','short rib*','rib eye','ribeye','sirloin','striploin','eye fillet','rump','steak*','mince','kangaroo','oxtail','cheek*','shank*','goat leg','goat shoulder','lamb rump','pork belly','chorizo','prosciutto','pancetta','bacon']},
  {key:'starch',  label:'Starch',                  lead:3, batchWindow:3, weekendShift:true, family:'starch',
   legend:['starch','starches','big jobs','big job'],
   words:['potato*','mash','rice','risotto','pasta','gnocchi','polenta','bread','brioche','dough','noodle*','ravioli','tortellini','couscous','quinoa','croquette*','fondant','pomme*','farro','freekeh','lentil*','barley','pastry','tart shell*','lasagne','lasagna']},
  {key:'garnish', label:'Garnish, pick herbs',     lead:2, batchWindow:2, weekendShift:true, family:'garnish',
   legend:['garnish','garnishes','pick herbs','picked herbs','herbs','garnish pick herbs','garnishes pick herbs'],
   words:['garnish*','pick','picked','herb','herbs','parsley','chervil','dill','coriander','mint','basil','chive*','tarragon','sage','thyme','rosemary','oregano','shiso','edible flower*','flower edible','flowers','pickle*','pickled','viola','allysium','alyssum','sorrel','red vein','soaked raisin','raisin','fennel seed','seed mix','pea tendril','tendril','blossom*','zucchini blossom','salmon roe','trout roe','roe','caviar','tobiko','karkalla','samphire','sea blite']},
  /* 4.8.25 Gerard soft/hard veg (named lists). Matching still uses produce words → 'veg',
   * then classifyGerardVeg / classifyVegPrepStage refine to vegsoft|veghard|vegraw|vegcook. */
  {key:'vegsoft', label:'Vegetables (soft · 2 days)', lead:2, batchWindow:2, weekendShift:true, family:'veg',
   legend:['soft veg','soft vegetables','veg soft'],
   words:[]},
  {key:'veghard', label:'Vegetables (hard · 4 days)', lead:4, batchWindow:4, weekendShift:true, family:'veg',
   legend:['hard veg','hard vegetables','veg hard'],
   words:[]},
  {key:'veg',     label:'Vegetables',              lead:3, batchWindow:3, weekendShift:true, family:'veg',
   legend:['veg','vege','veges','veggies','vegetable','vegetables'],
   words:['veg','vege','vegetable*','carrot*','dutch carrot*','baby carrot*','onion*','shallot*','eschalot*','leek*','celery','celeriac','fennel','beetroot*','beet*','pumpkin','squash','zucchini','eggplant','aubergine','capsicum*','mushroom*','cauliflower','broccoli*','broccolini','asparagus','pea','peas','bean*','kale','spinach','cabbage','tomato*','cucumber*','radish*','corn','garlic','lettuce','greens','cos','witlof','endive','artichoke*','parsnip*','turnip*','kohlrabi','silverbeet','chard','okra','salad','warrigal','karkalla','samphire','sea blite','seablight','blite','iceplant','saltbush','davidson','finger lime','bunya','yam daisy','compressed apple','apple dice','apple','shimeji','enoki','king brown','gem lettuce','baby gem','pencil leek','sweet potato','potato']},
  {key:'vegraw',  label:'Vegetables (raw / trim)', lead:4, batchWindow:4, weekendShift:true, family:'veg',
   legend:[], words:[]},
  {key:'vegcook', label:'Vegetables (cooked)',     lead:3, batchWindow:3, weekendShift:true, family:'veg',
   legend:[], words:[]},
  {key:'poultry', label:'Poultry (3 days)',          lead:3, batchWindow:3, weekendShift:true, family:'protein',
   legend:['poultry','chicken','duck','birds','game birds'],
   words:['poultry','chicken','duck','turkey','quail','spatchcock','poussin','guinea fowl','pheasant','goose','pigeon','squab','confit leg','thigh*','drumstick*','wing*']},
  /* 4.8.26: cheese lead=3; butters/creams stay on dairy lead=4 */
  {key:'cheese',  label:'Cheese (3 days)',           lead:3, batchWindow:3, weekendShift:true, family:'dairy',
   legend:['cheese','cheeses','cheese dairy'],
   words:['cheese*','parmesan','parmigiano','pecorino','grana padano','mozzarella','burrata','ricotta','feta','haloumi','halloumi','goat curd','labneh','mascarpone','stracciatella','gruyere','cheddar','brie','camembert','blue cheese']},
  {key:'dairy',   label:'Butters and creams',        lead:4, batchWindow:4, weekendShift:true, family:'dairy',
   legend:['dairy','butter','butters','cream','creams','butters creams'],
   words:['butter*','cream','creams','creme fraiche','crème fraîche','sour cream','chantilly','custard','yoghurt','yogurt']},
  {key:'dressing', label:'Dressings',              lead:4, batchWindow:4, weekendShift:true, family:'dressing',
   legend:['dressing','dressings','vinaigrette','vinaigrettes'],
   words:['dressing*','vinaigrette*','mayo','mayonnaise','aioli','ranch']},
  /* Crab croquettes (bulked/frozen): 4-day protein-style window. Keyword rule overrides plain "crab" seafood. */
  {key:'crabcroq', label:'Crab croquettes (frozen bulk)', lead:4, batchWindow:4, weekendShift:true, family:'starch',
   legend:[],
   words:[]}
];

/* 4.8.25 — Gerard named soft (2) / hard (4) veg lists. Specificity before generics.
 * Returns { key, lead, stage, clear, reason, covered:true } or null if not on either list.
 * Callers fall back to classifyVegPrepStage (vegraw/vegcook) for unlisted veg.
 */
window.classifyGerardVeg = function classifyGerardVeg(taskText) {
  var raw = String(taskText == null ? '' : taskText);
  var t = raw.toLowerCase()
    .replace(/[ée]/g, function (m) { return m === 'é' ? 'e' : m; })
    .replace(/[’']/g, "'");
  var parts = t.split(/\s*\/\s*/);
  var head = (parts[0] || '').trim();
  var method = parts.slice(1).join(' / ');
  var all = t;

  function hit(re) { return re.test(head) || re.test(all); }
  function soft(reason) {
    return { key: 'vegsoft', lead: 2, stage: 'soft', clear: true, reason: reason, covered: true };
  }
  function hard(reason) {
    return { key: 'veghard', lead: 4, stage: 'hard', clear: true, reason: reason, covered: true };
  }

  /* --- Specificity first (soft vs hard for same produce) --- */
  /* sauteed warrigal = soft 2; picked warrigal = hard 4; bare warrigal → not covered */
  if (/\b(saute|sauteed|sauted|sauteeing|sauté(?:ed)?)\b/.test(all) && /\bwarrigal\b/.test(all)) {
    return soft('sauteed warrigal → soft 2');
  }
  if (/\b(pick|picked|picking)\b/.test(all) && /\bwarrigal\b/.test(all)) {
    return hard('picked warrigal → hard 4');
  }
  /* shaved fennel = soft 2; roasted / sous vide fennel = hard 4; bare fennel → not covered */
  if (/\b(shave|shaved|shaving)\b/.test(all) && /\bfennel\b/.test(all) && !/\bfennel\s+seed/.test(all)) {
    return soft('shaved fennel → soft 2');
  }
  if (/\b(roast|roasted|roasting)\b/.test(all) && /\bfennel\b/.test(all) && !/\bfennel\s+seed/.test(all)) {
    return hard('roasted fennel → hard 4');
  }
  if (/\bsous[\s-]?vide\b/.test(all) && /\bfennel\b/.test(all)) {
    return hard('sous vide fennel → hard 4');
  }

  /* --- Soft list (2 days) --- */
  if (/\bzucchini\s+flowers?\b|\bzucchini\s+blossoms?\b|\bcourgette\s+flowers?\b/.test(all)) {
    return soft('zucchini flower → soft 2');
  }
  if (/\bceleriac\b/.test(all) && /\bremoulade\b/.test(all)) {
    return soft('celeriac remoulade → soft 2');
  }
  if (/\b(zucchini|courgette|cougrette)\b/.test(all) && !/\boil\b/.test(head)) {
    return soft('zucchini → soft 2');
  }
  if (/\bradish(?:es)?\b/.test(head) || /\bradish(?:es)?\b/.test(all)) {
    return soft('radish → soft 2');
  }
  /* apple (not pineapple); compressed apple / apple dice / apple & … */
  if (/\bpineapple\b/.test(all)) { /* skip */ }
  else if (/\b(compressed\s+)?apples?\b/.test(head) || /\bapple\s+dice\b/.test(all) || /\bapples?\b/.test(head)) {
    return soft('apple → soft 2');
  }

  /* --- Hard list (4 days) --- */
  if (/\bpickled\s+(veg(?:etable)?s?|onion|onion|carrot|beet|cucumber|radish|veg)\b/.test(all) ||
      (/\b(pickle|pickled)\b/.test(all) && /\b(vegetable|veges|veg)\b/.test(all))) {
    return hard('pickled vegetables → hard 4');
  }
  if (/\b(dutch\s+)?carrots?\b|\bbaby\s+carrots?\b/.test(all)) return hard('carrots → hard 4');
  if (/\b(onion|onions|shallot|shallots|eschalot|eschalots|eschallot|eschallots)\b/.test(head) ||
      (/\b(onion|onions|shallot|shallots|eschalot|eschallot)\b/.test(all) && !/\bpickled\s+esch/.test(all) && !/\boil\b/.test(head))) {
    /* pickled eschallots in a soft dish garnish may still hit — Gerard listed onions as hard */
    if (/\b(onion|onions|shallot|shallots|eschalot|eschalots|eschallot|eschallots)\b/.test(all)) {
      return hard('onions → hard 4');
    }
  }
  if (/\bbeetroots?\b|\bbeets?\b/.test(all)) return hard('beetroot → hard 4');
  if (/\bpumpkin\b|\bbutternut\b/.test(all)) return hard('pumpkin → hard 4');
  if (/\bsweet\s+potatos?\b|\bsweet\s+potatoes\b|\bkumara\b/.test(all)) return hard('sweet potato → hard 4');
  if (/\bparsnips?\b/.test(all)) return hard('parsnip → hard 4');
  if (!/\bsweet\s+potato/.test(all) && /\b(potatos?|potatoes|pomme)\b/.test(all)) {
    return hard('potato → hard 4');
  }
  if (/\bpencil\s+leeks?\b/.test(all)) return hard('pencil leek → hard 4');
  if (/\bleeks?\b/.test(all)) return hard('leeks → hard 4');
  if (/\bturnips?\b/.test(all)) return hard('turnips → hard 4');
  if (/\b(baby\s+)?gem(\s+lettuce)?\b|\bgem\s+leaf\b|\bgem\s+leaves\b/.test(all)) return hard('gem lettuce → hard 4');
  if (/\bwitlofs?\b|\bwhitlofs?\b|\bwitloofs?\b|\bendives?\b/.test(all)) return hard('witlof → hard 4');
  if (/\bpicked\s+leaves\b|\bpick\s+leaves\b|\bpicked\s+leaf\b/.test(all)) return hard('picked leaves → hard 4');
  if (/\bgarlic\s+flowers?\b/.test(all)) return hard('garlic flowers → hard 4');
  if (/\bedible\s+flowers?\b/.test(all)) return hard('edible flowers → hard 4');
  if (/\bflowers?\b/.test(head) && !/\bzucchini\s+flower|\boil\b|\bflour\b/.test(all)) {
    return hard('flowers → hard 4');
  }
  if (/\bice\s*plants?\b|\biceplant\b/.test(all)) return hard('iceplant → hard 4');
  if (/\bsamphires?\b/.test(all)) return hard('samphire → hard 4');
  if (/\bkarkallas?\b/.test(all)) return hard('karkalla → hard 4');
  if (/\bsea[\s-]?blights?\b|\bseablights?\b|\bsea\s+blites?\b|\bblites?\b/.test(all)) {
    return hard('seablight → hard 4');
  }

  return null;
};

/* 4.8.12 fallback — Gerard: veg raw (collect/trim) ≤4; cooked ≤3. Used when classifyGerardVeg returns null.
 * Returns { key:'vegraw'|'vegcook', stage, clear, reason, covered:false }.
 */
window.classifyVegPrepStage = function classifyVegPrepStage(taskText) {
  var raw = String(taskText == null ? '' : taskText);
  var t = raw.toLowerCase().replace(/[ée]/g, function (m) { return m === 'é' ? 'e' : m; });
  var parts = t.split(/\s*\/\s*/);
  var head = (parts[0] || '').trim();
  var method = parts.slice(1).join(' / ');
  var body = method || t;

  var RAW_RE = /\b(collect|collection|pick|picked|picking|trim|trimmed|trimming|wash|washed|washing|peel|peeled|peeling|cut|cutting|slice|sliced|slicing|dice|diced|dicing|shave|shaved|shaving|portion|portioned|decant|shred|shredded|drain|drained|bag(?:ged)?|tray(?:ed)?)\b/;
  var COOK_RE = /\b(roast|roasted|roasting|blanch|blanched|blanching|cook|cooked|cooking|puree|pureed|purees|confit|grill|grilled|grilling|saute|sauteed|sauted|fry|fried|frying|oven|bake|baked|baking|steam|steamed|steaming|boil|boiled|boiling|braise|braised|char|charred|sear|seared|poach|poached|sous[\s-]?vide|compress(?:ed)?|fermen(?:t|ted)|pickle(?:d)?|cure(?:d)?|smoke(?:d)?|glaze(?:d)?|caramelis(?:e|ed)|carameliz(?:e|ed)|reduce(?:d)?|reduction|ragu|remoulade|marinade|marinate(?:d)?)\b/;
  var RUB_RE = /(^|\/)\s*rub\b/;

  var hasCook = COOK_RE.test(body) || COOK_RE.test(head) || RUB_RE.test(body);
  var hasRaw = RAW_RE.test(body);

  if (hasCook) {
    return { key: 'vegcook', stage: 'cooked', clear: true, reason: 'cook-stage keyword', covered: false };
  }
  if (hasRaw && method) {
    return { key: 'vegraw', stage: 'raw', clear: true, reason: 'raw-stage keyword only', covered: false };
  }
  return { key: 'vegcook', stage: 'cooked', clear: false, reason: 'unclear — default cooked (shorter)', covered: false };
};

/** 4.8.25: Gerard list first, else raw/cook fallback. */
window.classifyVegLead = function classifyVegLead(taskText) {
  if (typeof window.classifyGerardVeg === 'function') {
    var g = window.classifyGerardVeg(taskText);
    if (g) return g;
  }
  return window.classifyVegPrepStage(taskText);
};

