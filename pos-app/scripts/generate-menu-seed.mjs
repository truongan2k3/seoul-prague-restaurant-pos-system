/**
 * @deprecated Prefer scripts/generate-menu-from-xlsx.py → supabase/seed-menu-from-old-system.sql
 * Generates supabase/seed-menu-jin-cheng.sql from embedded menu CSV rows (legacy 88-item grill menu).
 * Run: node scripts/generate-menu-seed.mjs
 */

import { writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const rows = `Grill Sets,1498,Busan Set,Busan Set,釜山套餐,"A balanced introduction to the grill.","Úvodní seznámení s grilem.","均衡体验炭火烤肉的入门套餐",,TRUE
Grill Sets,1799,Jeju Island Set,Ostrov Jeju Set,济州岛套餐,"A generous land-and-sea experience with variety.","Velkorysý zážitek z pevniny i moře s rozmanitostí.","丰富多样的海陆组合体验。",,TRUE
Grill Sets,2199,Gangwon-do Set,Gangwon-do Set,江原道套餐,"A richer beef-forward set with outstanding value.","Bohatý set s prvotřídním hovězím masem.","以牛肉为主性价比出色的丰盛套餐。",,TRUE
Grill Sets,2399,Seoul Signature Set,Seoul Signature Set,首尔招牌套餐,"Our most luxurious grill set, crafted for memorable tables.","Náš nejluxusnější grilovací set s řadou vzácných a nezapomenutelných kousků.","为难忘的餐桌体验精心打造的顶级炭火烤肉套餐。",,TRUE
BBQ Grill,998,Japanese A5 Wagyu,Japonské Wagyu A5,日本A5和牛,,,,,TRUE
BBQ Grill,698,Premium Australian Wagyu Short Rib,Prémiové australské Wagyu krátké žebro,澳洲精品牛小排和牛,,,,,TRUE
BBQ Grill,680,Australian Wagyu Ribeye,Australské Wagyu Ribeye,澳洲和牛眼肉,,,,,TRUE
BBQ Grill,658,U.S. Angus Sirloin,U.S. Angus nízký roštěnec,美国安格斯西冷,,,,,TRUE
BBQ Grill,598,Australian Wagyu Bone-In Short Rib,Australské wagyu krátké žebro s kostí,澳洲和牛 牛仔骨,,,,,TRUE
BBQ Grill,298,Angus Beef Tongue,Hovězí jazyk Angus,安格斯牛舌,,,,,TRUE
BBQ Grill,580,Marinated Marbled Beef Short Rib,Marinované hovězí krátké žebro,调味雪花牛仔骨,,,,,TRUE
BBQ Grill,450,Smoked Angus Beef Brisket,Uzený hovězí hrudí Angus,安格斯牛胸肉,,,,,TRUE
BBQ Grill,380,Beef Enoki Rolls,Hovězí rolky s enoki,牛肉金针菇卷,,,,,TRUE
BBQ Grill,1398,Wagyu Assorted Platter,Degustační talíř wagyu,和牛拼盘,,,,,TRUE
BBQ Grill,458,Thick-Cut Pork Belly,Vepřový bůček na silné plátký,厚切五花肉,,,,,TRUE
BBQ Grill,498,Marinated Pork Belly,Marinovaný vepřový bůček,调味五花肉,,,,,TRUE
BBQ Grill,498,Mapo Marinated Pork Rib,Mapo marinované vepřové žebro,麻浦调味猪排,,,,,TRUE
BBQ Grill,598,Pork Assorted Platter,Degustační talíř vepřového,猪肉拼盘,,,,,TRUE
BBQ Grill,458,Pork Collar,Vepřová Krkovice,猪梅花肉,,,,,TRUE
BBQ Grill,328,Marinated Chicken Thigh,Marinované kuřecí stehna,调味鸡腿肉,,,,,TRUE
BBQ Grill,698,Grilled Eel,Grilovaný úhoř,烤鳗鱼,,,,,TRUE
BBQ Grill,498,Tiger Prawns,Tygří krevety,虎虾,,,,,TRUE
BBQ Grill,198,Vegetable Platter,Zeleninový talíř,蔬菜拼盘(4种),,,,,TRUE
Hot Pot,980,Seafood Hot Pot,Mořské plody Hot Pot,海鲜火锅,"Single-serve seafood broth with vegetables, tofu, and comfort in every spoon.","Porce pro jednoho s vývarem z mořských plodů, zeleninou, tofu a hřejivou chutí v každé lžíci.","单人份海鲜汤底，搭配蔬菜与豆腐，每一口都温暖满足。",,TRUE
Hot Pot,680,Pork Bone Hotpot,Vepřový vývar Hotpot,脊骨火锅,"Single-serve pork bone broth with deep savory warmth and tender meat.","Porce pro jednoho s vývarem z vepřových kostí, plnou hřejivou chutí a křehkým masem.","单人份猪骨浓汤，汤味醇厚，肉质软嫩。",,TRUE
Hot Pot,680,Kimchi Hotpot,Kimchi Hotpot,泡菜火锅,"Single-serve kimchi broth with a tangy warming character and balanced heat.","Porce pro jednoho s kimchi vývarem, lehce kyselou hřejivou chutí a vyváženou pikantností.","单人份泡菜汤底，酸香开胃，辣度平衡而温暖。",,TRUE
Hot Pot,699,Nine-grid platter set,Devítidílný set,九宫格,"Sliced beef, sliced lamb, napa cabbage, seasonal greens, enoki mushrooms, tofu, sliced potatoes, beef meatballs, and shrimp.","Plátky hovězího a jehněčího, pekingské zelí, sezónní zelenina, houby enoki, tofu, plátky brambor, hovězí masové kuličky a krevety.","牛肉卷、羊肉卷、大白菜、青菜、金针菇、豆腐、土豆片、牛肉丸、虾。",,TRUE
Rice & Dolsot,258,Seafood Fried Rice,Smažená rýže s mořskými plody,海鲜炒饭,"Wok-fried rice with seafood, egg, and gentle smokiness.","Ve woku smažená rýže s mořskými plody, vejcem a jemným kouřovým aroma.","海鲜与鸡蛋炒制而成，带有淡淡锅气。",,TRUE
Rice & Dolsot,358,Wagyu Fried Rice,Restovaná rýže s wagyu,和牛炒饭,"Rich wagyu flavor through fragrant wok-tossed rice.","Výrazná chuť wagyu v aromatické rýži orestované ve woku.","香气四溢的炒饭，融入浓郁和牛风味。",,TRUE
Rice & Dolsot,228,Vegetarian Dolsot Bibimbap,Vegetariánský Bibimbap Dolsot,素食石锅拌饭,"Seasonal vegetables over rice with house bibimbap sauce.","Sezónní zelenina na rýži s domácí omáčkou bibimbap.","搭配时令蔬菜与自制拌饭酱的石锅拌饭。",,TRUE
Rice & Dolsot,198,Kimchi Fried Rice,Restovaná rýže s kimchi,泡菜炒饭,"Savory kimchi rice with balanced heat and depth.","Rýže s kimchi s vyváženou pikantností a plnou chutí.","风味浓郁的泡菜炒饭，辣度平衡、层次丰富。",,TRUE
Rice & Dolsot,278,Beef Rice Bowl,Miska s hovězím a rýží,牛肉盖饭,"Tender beef over steamed rice with savory glaze.","Jemné hovězí maso na dušené rýži s výraznou umami glazurou.","嫩牛肉配咸香酱汁，铺在米饭上享用。",,TRUE
Rice & Dolsot,268,Beef Dolsot Bibimbap,Bibimbap Dolsot,牛肉石锅拌饭,"Sizzling stone pot rice with beef, vegetables, and egg.","Horká rýže v kamenné misce s hovězím masem, zeleninou a vejcem.","热腾腾的石锅拌饭，配有牛肉、蔬菜和鸡蛋。",,TRUE
Rice & Dolsot,278,Pork Belly Rice Bowl,Miska s vepřovým bůčkem,五花肉盖饭,"Grilled pork belly over rice with rich caramelized flavor.","Grilovaný vepřový bůček na rýži s výraznou karamelizovanou chutí.","烤五花肉铺在米饭上，带有浓郁焦糖化风味。",,TRUE
Rice & Dolsot,278,Chicken Dolsot Bibimbap,Kuřecí Bibimbap Dolsot,鸡肉石锅拌饭,"Stone pot rice with chicken and vibrant vegetables.","Rýže v kamenné misce s kuřecím masem a svěží zeleninou.","搭配鸡肉与新鲜蔬菜的石锅拌饭。",,TRUE
Korean Kitchen I,268,Jajangmyeon,Jajangmyeon,炸酱面,"Classic black bean noodles with a rich, savory finish.","Klasické nudle s černou fazolovou omáčkou s bohatou plnou chutí.","经典黑豆酱面，风味浓郁咸香。",,TRUE
Korean Kitchen I,360,Spicy Seafood Ramen,Pikantní Ramen s mořskými plody,辣味海鲜面,"Seafood, vegetables, and bold chili warmth in a deeply satisfying broth.","Mořské plody, zelenina a červené chilli v sytém vývaru.","海鲜与蔬菜搭配浓郁辣味汤底，暖胃满足。",,TRUE
Korean Kitchen I,260,Kimchi Ramen,Kimchi Ramen,泡菜拉面,"Springy noodles in a tangy kimchi broth with comforting spice.","Nudle v pikantně kyselém kimchi vývaru s hřejivou ostrostí.","弹牙面条搭配酸香微辣的泡菜汤底。",,TRUE
Korean Kitchen I,358,Spicy Beef Ramen,Pikantní hovězí Ramen,牛肉面,"Spicy beef and noodles in a rich warming chili broth.","Pikantní hovězí maso v bohatém hřejivém chilli vývaru.","牛肉与面条搭配浓郁暖胃的辣味汤底。",,TRUE
Korean Kitchen I,360,Crispy Fried Shrimp,Křupavé tempura krevety,炸虾,"Lightly crisp, golden shrimp with a delicate crunch.","Křehké zlatavé krevety s delikátní křupavou krustou.","金黄轻脆的炸虾，口感细腻酥香。",,TRUE
Korean Kitchen I,268,Korean Fried Chicken Bites,Korejské kuřecí kousky,炸鸡块,"Crunchy chicken bites with a glossy savory finish.","Křupavé kuřecí kousky s lesklou glazurou.","香脆鸡块裹上光泽浓郁的咸香酱汁。",,TRUE
Korean Kitchen I,198,Kimchi Pancake,Kimchi placka,泡菜饼,"Crisp-edged pancake layered with kimchi and balanced heat.","Křupavá placka vrstvená kimchi a vyváženou pálivostí.","边缘香脆的泡菜煎饼，酸香开胃、辣度平衡。",,TRUE
Korean Kitchen I,268,Seafood Pancake,Placka s mořskými plody,海鲜饼,"A savory pancake with shrimp, squid, and vegetables.","Slaná placka s krevetami, chobotnicí a zeleninou.","加入虾、鱿鱼与蔬菜制成的鲜香海鲜煎饼。",,TRUE
Korean Kitchen I,178,Pan-Fried Dumplings,Gyoza,煎饺,"Golden-bottom dumplings with juicy pork filling, ideal for sharing.","Jemné knedličky s křupavou spodní krustou a šťavnatým vepřovým masem.","底部金黄酥脆、内馅多汁的猪肉煎饺，适合分享。",,TRUE
Korean Kitchen II,298,Kimchi Pork Belly Stir-fry,Restovaný vepřový bůček s kimchi,泡菜炒五花肉,"Bold pork belly and kimchi with a savory, spicy edge.","Výrazný vepřový bůček a kimchi s bohatou, pikantní chutí.","浓郁五花肉与泡菜一同炒制，咸香微辣。",,TRUE
Korean Kitchen II,680,Braised Beef Short Ribs,Dušená hovězí krátká žebra,炖牛排骨,"Slow-braised short ribs with a deep glossy glaze.","Pomalu dušená krátká žebra s výraznou lesklou glazurou.","牛小排慢炖入味，酱汁浓郁油亮。",,TRUE
Korean Kitchen II,680,Cheese Tteokbokki Chicken,Kuřecí tteokbokki se sýrem,芝士年糕鸡,"Spicy chicken and rice cakes finished with melted cheese.","Pikantní kuřecí maso a tteok s rozpuštěným sýrem.","香辣鸡肉与年糕，覆上浓郁融化芝士。",,TRUE
Korean Kitchen II,260,Stir-fried Rice Cakes,Restované tteok,炒年糕,"Chewy rice cakes in a lively, spicy sauce.","Tteok v pikantní omáčce.","软糯Q弹的年糕，搭配鲜香辣酱炒制。",,TRUE
Korean Kitchen II,450,Spicy Stir-fried Pork Belly,Pikantní restovaný vepřový bůček,辣炒五花肉,"Smoky pork belly tossed in sweet heat with a caramelized finish.","Vepřový bůček ve sladce pikantní omáčce.","带有锅气的五花肉，甜辣炒制并带焦香风味。",,TRUE
Korean Kitchen II,680,Grilled Squid with Pork Belly,Grilovaná oliheň s vepřovým bůčkem,烤鱿鱼五花肉,"A savory land-and-sea pairing finished over the grill.","Výrazná kombinace masa a mořských plodů.","鱿鱼与五花肉的海陆组合，炒制出浓郁炙烤香气。",,TRUE
Korean Kitchen II,298,Japchae Glass Noodles,Japchae skleněné nudle,炒粉丝,"Silky glass noodles stir-fried with vegetables and soy sweetness.","Jemné skleněné nudle restované se zeleninou a lehce nasládlou sójovou chutí.","弹滑粉丝与蔬菜一同炒制，带有淡淡酱香甜味。",,TRUE
Korean Kitchen II,728,Stir-fried Beef & Baby Octopus,Restované hovězí a mini chobotničky,炒牛肉八爪鱼,"Tender beef and baby octopus with bold Korean spice.","Křehké hovězí a mini chobotničky s výrazným korejským kořením.","嫩牛肉与小章鱼搭配浓郁韩式辣酱炒制。",,TRUE
Korean Kitchen II,580,Yukhoe Seasoned Raw Beef,Yukhoe tatarák,生拌牛肉,"Delicately seasoned raw wagyu beef with refined sesame notes.","Jemné ochucené syrové wagyu hovězí.","精心调味的生和牛，带有细腻芝麻香气。",,TRUE
Sushi I,298,Tempura Shrimp Roll,Tempura Shrimp Roll,天妇罗炸虾卷,"Carrot, cucumber, and shrimp inside topped with avocado and finished with eel glaze and citrus mayo.","Mrkev, okurka a krevety uvnitř, navrchu avokádo a dokončené úhořovou glazurou a citrusovou majonézou.","内：胡萝卜丝、黄瓜丝、外：牛油果片、鳗鱼汁。",,TRUE
Sushi I,318,Grilled Eel Uramaki,Uramaki s grilovaným úhořem,烤鳗鱼反卷,"Avocado, crab stick and cucumber inside, wrapped with eel and finished with sesame and eel sauce.","Avokádo, krabí tyčinka a okurka uvnitř, obalené úhořem a dokončené úhořovou glazurou.","内：牛油果、蟹柳、黄瓜丝、外：鳗鱼片、鳗鱼汁、芝麻。",,TRUE
Sushi I,328,Aburi Salmon Roll,Aburi Losos,炙烤三文鱼卷,"Avocado, crab stick, and cucumber topped with seared salmon, baked sauce, and tobiko.","Avokádo, krabí tyčinka a okurka, navrchu opečený losos, omáčka a tobiko.","内：牛油果、蟹柳、黄瓜丝、外：三文鱼片、焗酱、飞鱼籽。",,TRUE
Sushi I,268,California Tobiko Roll,California Tobiko Roll,加州飞鱼籽卷,"Avocado, crab stick, and salmon finished with tobiko, herbs, and eel glaze.","Avokádo, krabí tyčinka a losos, dokončené tobiko, bylinkami a úhořovou glazurou.","内：牛油果、蟹柳、三文鱼、外：绿色花草、鳗鱼汁。",,TRUE
Sushi I,298,Crispy Tempura Salmon Roll,Křupavá Tempura Losos,脆皮三文鱼卷,"Salmon and avocado with eel glaze and white sesame.","Losos a avokádo s úhořovou glazurou a bílým sezamem.","内：三文鱼、牛油果、外：鳗鱼汁、花草、白芝麻。",,TRUE
Sushi I,318,Seoul Signature Beef Roll,Seoul Signature Hovězí,首尔经典反卷,"Beef, cucumber, and carrot finished with Korean spicy sauce and sesame.","Hovězí maso, okurka a mrkev, dokončené korejskou pikantní omáčkou a sezamem.","内：牛肉、黄瓜丝、胡萝卜丝、外：韩式辣酱、芝麻。",,TRUE
Sushi II,398,Tempura Shrimp Roll + 4 avocado nigiri,Tempura krevety + 4 avokádo nigiri,天妇罗炸虾卷+牛油果手握4个,"A refined pairing for guests who enjoy contrast and freshness.","Rafinovaná kombinace pro hosty, kteří si potrpí na kontrasty a svěžest.","为喜爱层次对比与清新风味的客人打造的精致组合。",,TRUE
Sushi II,428,Aburi Salmon Roll + 4 Eel Hosomaki,Aburi Losos + 4 úhoř Hosokami,炙烤三文鱼卷+鳗鱼小卷4个,"A rich and balanced combination of seared salmon and eel.","Bohatá a vyvážená kombinace zapečeného lososa a úhoře.","炙烤三文鱼与鳗鱼相互平衡的丰富组合。",,TRUE
Sushi II,428,California Tobiko Roll + 4 Salmon Nigiri,California Tobiko Roll + 4 losos Nigiri,加州鱼籽卷+三文鱼手握4个,"A guest-friendly platter with elegant salmon notes.","Oblíbená kombinace s křupavým tobiko a elegantním lososem.","以优雅三文鱼风味为主、广受欢迎的拼盘。",,TRUE
Sushi II,399,Hosomaki Trio Set,Hosomaki Trio Set,小卷三套餐,"Salmon, Avocado, and Eel. 18 pieces total.","Losos, avokádo a úhoř - 18 ks.","三文鱼，牛油果，鳗鱼，共18个。",,TRUE
Soups & Stews,268,Pork Bone Soup,Vepřový vývar,脊骨汤(猪肉),"Slow-simmered pork bone broth with deep comforting richness.","Pomalu tažený vývar z vepřových kostí s hlubokou, hřejivou chutí.","猪骨慢火熬煮，汤味浓郁暖心。",,TRUE
Soups & Stews,280,Pork Kimchi Soup,Kimchi polévka s vepřovým,泡菜汤(猪肉),"Kimchi and pork in a warming tangy broth.","Kimchi a vepřové maso v hřejivém, nakyslém vývaru.","泡菜与猪肉熬制而成，酸香暖胃。",,TRUE
Soups & Stews,360,Beef Rib Soup,Polévka z hovězích žeber,牛排骨汤,"Tender beef rib in a clear, savory broth.","Křehké hovězí žebro v čirém, plném vývaru.","软嫩牛排骨搭配清澈鲜香的汤底。",,TRUE
Soups & Stews,280,Spicy Seafood Soup,Pikantní s mořskými plody,海鲜辣汤,"Seafood and vegetables in a vivid, spicy broth.","Mořské plody a zeleninou ve výrazném, pikantním vývaru.","海鲜与蔬菜搭配浓郁鲜辣汤底。",,TRUE
Soups & Stews,328,Spicy Beef Soup,Pikantní hovězí polévka,牛肉汤,"A robust beef soup with warming chili depth.","Poctivá hovězí polévka s hřejivou chilli aroma.","浓郁牛肉汤底，带有醇厚暖胃的辣椒风味。",,TRUE
Soups & Stews,280,Beef Doenjang Soup,Hovězí Doenjang polévka,牛肉大酱汤,"Earthy soybean broth with beef and vegetables.","Sójový vývar s hovězím masem a zeleninou.","醇香大酱汤底，搭配牛肉与蔬菜。",,TRUE
Soups & Stews,229,Seafood Soft Tofu Soup,Mořské plody a silky tofu,海鲜豆腐汤,"Silky tofu and seafood in a bubbling spicy broth.","Silky tofu a mořské plody v pikantním vývaru.","嫩滑豆腐与海鲜在鲜辣汤底中沸煮而成。",,TRUE
Drinks I,109,Raspberry Lemonade,Malinovka,覆盆子,,,,,TRUE
Drinks I,109,Yuzu & Lemon,Yuzu & citron,柚子与柠檬,,,,,TRUE
Drinks I,109,Mango Iced Tea,Mango,芒果,,,,,TRUE
Drinks I,109,Jasmin & Lemon Iced Tea,Jasmín & citron ledový čaj,茉莉柠檬冰茶,,,,,TRUE
Drinks I,109,Lychee Red Iced Tea,Červený čaj s liči,荔枝红茶冰茶,,,,,TRUE
Drinks I,79,Pilsner Urquell 0.5l,Pilsner Urquell 0.5l,Pilsner Urquell 0.5l,,,,,TRUE
Drinks I,65,Kofola 0.5l,Kofola 0.5l,Kofola 0.5l,,,,,TRUE
Drinks I,69,Espresso,Espresso,Espresso,,,,,TRUE
Drinks I,89,Latte,Latte,Latte,,,,,TRUE
Drinks I,75,Coca Cola,Coca Cola,Coca Cola,,,,,TRUE
Drinks II,199,Sakura Gin Fizz,Sakura Gin Fizz,櫻花金酒菲士,,,,,TRUE
Drinks II,219,Seoul Sunset,Seoul Sunset,首尔日落,,,,,TRUE
Drinks II,219,Makgeolli Peach Punch,Makgeolli Peach Punch,米酒蜜桃潘趣,,,,,TRUE
Drinks II,219,Yuzu Highball,Yuzu Highball,柚子嗨棒,,,,,TRUE
Drinks II,199,Soju Mojito,Soju Mojito,烧酒莫吉托,,,,,TRUE
Drinks II,398,Soju 0.33l,Soju 0.33l,韩国烧酒 0.33l,,,,,TRUE
Drinks II,498,Makgeolli 0.75l,Makgeolli 0.75l,马格利米酒 0.75l,,,,,TRUE
Drinks II,89,Milkis,Milkis,Milkis 乳酸菌饮料,,,,,TRUE`;

function parseCsvLine(line) {
  const fields = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      fields.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  fields.push(current);
  return fields;
}

function sqlStr(value) {
  if (!value || !value.trim()) return "NULL";
  return `'${value.replace(/'/g, "''")}'`;
}

function isDrinkCategory(category) {
  return category.toLowerCase().startsWith("drinks");
}

const parsed = rows
  .trim()
  .split("\n")
  .map((line) => {
    const [
      category,
      price,
      nameEn,
      nameCz,
      nameZh,
      descriptionEn,
      descriptionCz,
      descriptionZh,
      imageUrl,
      isAvailable,
    ] = parseCsvLine(line);
    return {
      category,
      price: Number(price),
      nameEn,
      nameCz,
      nameZh,
      descriptionEn,
      descriptionCz,
      descriptionZh,
      imageUrl,
      isAvailable: isAvailable.toUpperCase() === "TRUE",
    };
  });

const inserts = parsed.map((item, index) => {
  const id = `40000000-0000-4000-a000-${String(index + 1).padStart(12, "0")}`;
  const station = isDrinkCategory(item.category) ? "bar" : "kitchen";
  const itemType = isDrinkCategory(item.category) ? "drink" : "food";
  const sortOrder = index + 1;

  return `  (
    '${id}'::uuid,
    ${sqlStr(item.category)},
    ${item.price},
    ${sqlStr(item.nameEn)},
    ${sqlStr(item.nameCz)},
    ${sqlStr(item.nameZh)},
    ${sqlStr(item.descriptionEn)},
    ${sqlStr(item.descriptionCz)},
    ${sqlStr(item.descriptionZh)},
    ${sqlStr(item.imageUrl)},
    ${item.isAvailable},
    ${sqlStr(station)},
    ${sqlStr(itemType)},
    ${sortOrder},
    ${sqlStr(item.nameEn)},
    ${sqlStr(item.descriptionEn)},
    ${!item.isAvailable}
  )`;
});

const sql = `-- JIN CHENG menu seed (${parsed.length} items)
-- Run AFTER patch-menu-jin-cheng-schema.sql
-- WARNING: Deletes all existing menu_items rows.

BEGIN;

DELETE FROM public.menu_items;

INSERT INTO public.menu_items (
  id,
  category,
  price,
  name_en,
  name_cz,
  name_zh,
  description_en,
  description_cz,
  description_zh,
  image_url,
  is_available,
  station,
  item_type,
  sort_order,
  name,
  description,
  sold_out
) VALUES
${inserts.join(",\n")};

COMMIT;
`;

const outPath = join(__dirname, "..", "supabase", "seed-menu-jin-cheng.sql");
writeFileSync(outPath, sql, "utf8");
console.log(`Wrote ${parsed.length} items to ${outPath}`);
