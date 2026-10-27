/* PrepLine by Autoprod: prep start days by ingredient type (4.3.4).
 * EDIT THIS FILE to change the rules. Each category has:
 *   lead   - how many days BEFORE the event/function day the job starts (0 = on the day)
 *   legend - words that, in a spreadsheet's colour legend label, mean this category
 *   words  - keywords used only when a line has no legend colour (whole words, case-insensitive;
 *            a trailing * means "starts with", e.g. "puree*" also matches "purees")
 * Order matters: the first category whose words match wins, so the more specific ones
 * (micro herbs, dry garnish, oils) come before the general ones (garnish, vegetables).
 * Anything that matches nothing keeps the old behaviour and is shown as "uncategorised".
 */
window.PREP_DAYS_VOCAB = [
  {key:'micro',   label:'Micro herbs',             lead:0, family:'garnish',
   legend:['micro herbs','micro greens','micro herb','micros','micro'],
   words:['micro*','tendril*','sprout*','cress','shoots','pea shoots','baby herbs']},
  {key:'dry',     label:'Dry garnish and crumbs',  lead:1, family:'garnish',
   legend:['dry garnish','dry garnishes','dry garnish crumbs','dry garnishes crumbs','crumbs','crumb','dry'],
   words:['crumb*','crouton*','crumble','panko','dukkah','dukka','praline','tuile*','crisp*','chip','chips','powder','dust','soil','granola','toasted seeds','toasted nuts','candied nuts','seeds','furikake']},
  {key:'oil',     label:'Oils',                    lead:1, family:'garnish',
   legend:['oil','oils'],
   words:['oil','oils','chilli oil','herb oil','green oil']},
  {key:'gels',    label:'Gels and purees',         lead:3, family:'sauce',
   legend:['gel','gels','puree','purees','sauce','sauces','sauce puree gels','sauces purees gels'],
   words:['gel*','puree*','purée*','pureed','coulis','fluid gel','jelly']},
  {key:'seafood', label:'Seafood',                 lead:1, family:'protein',
   legend:['seafood','fish','shellfish'],
   words:['seafood','fish','salmon','tuna','prawn*','scallop*','barramundi','kingfish','hiramasa','snapper','cod','crab','lobster','octopus','squid','calamari','mussel*','oyster*','clam*','bug','bugs','trout','ling','mackerel','sardine*','anchov*','swordfish','whiting','flathead','john dory','bream','caviar','roe']},
  {key:'redmeat', label:'Red meat',                lead:4, family:'protein',
   legend:['red meat','red meats','meat','beef','lamb'],
   words:['beef','lamb','pork','veal','venison','wagyu','brisket','short rib*','rib eye','ribeye','sirloin','striploin','eye fillet','rump','steak*','mince','kangaroo','oxtail','cheek*','shank*','goat leg','goat shoulder','lamb rump','pork belly','chorizo','prosciutto','pancetta','bacon']},
  {key:'starch',  label:'Starch',                  lead:3, family:'starch',
   legend:['starch','starches','big jobs','big job'],
   words:['potato*','mash','rice','risotto','pasta','gnocchi','polenta','bread','brioche','dough','noodle*','ravioli','tortellini','couscous','quinoa','croquette*','fondant','pomme*','farro','freekeh','lentil*','barley','pastry','tart shell*','lasagne','lasagna']},
  {key:'garnish', label:'Garnish, pick herbs',     lead:2, family:'garnish',
   legend:['garnish','garnishes','pick herbs','picked herbs','herbs','garnish pick herbs','garnishes pick herbs'],
   words:['garnish*','pick','picked','herb','herbs','parsley','chervil','dill','coriander','mint','basil','chive*','tarragon','sage','thyme','rosemary','oregano','shiso','edible flower*','flower edible','flowers','pickle*','pickled']},
  {key:'veg',     label:'Vegetables',              lead:4, family:'veg',
   legend:['veg','vege','veges','veggies','vegetable','vegetables'],
   words:['veg','vege','vegetable*','carrot*','onion*','shallot*','leek*','celery','celeriac','fennel','beetroot*','beet*','pumpkin','squash','zucchini','eggplant','capsicum*','mushroom*','cauliflower','broccoli*','broccolini','asparagus','pea','peas','bean*','kale','spinach','cabbage','tomato*','cucumber*','radish*','corn','garlic','lettuce','greens','cos','witlof','artichoke*','parsnip*','turnip*','kohlrabi','silverbeet','chard','okra','salad']}
];
