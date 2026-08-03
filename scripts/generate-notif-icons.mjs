// Generates small, unhashed PNG icons for push notifications (workers/push-scheduler.js
// can't reach Vite-hashed src/assets/ URLs, so it needs stable paths under public/).
//
// Mirrors the stage → sprite file mapping in src/utils/sprites.ts (STAGE_SPRITES).
// Run manually whenever a new Digimon form is added there:
//   node scripts/generate-notif-icons.mjs
import { mkdir } from 'fs/promises';
import path from 'path';
import sharp from 'sharp';

const ASSETS_DIR = 'src/assets';
const OUT_DIR = 'public/notif-icons';
const SIZE = 192;

// stage id (as used in DIGIMON_STAGE_NAMES / STAGE_SPRITES) → source file in src/assets
const STAGE_SOURCE_FILE = {
  digiegg: '6479b687e03b8292ee02a4453bff2eb1a76cfecb.png',
  pichimon: '99ff747d7f7ecc2424e131a43c54669bcba9a301.png',
  pukamon: '104dc13e2c146bb51e00903d6eaa5f6fae7619c6.png',
  tapirmon: '7d2b0a9b519f16f1d0a258d9670cfc62230e1903.png',
  monochromon: '7bc96986446973a3544f57a9055e59fc87022f42.png',
  triceramon: '91974d820051b34dd9e9db8f1b4f72ae1216ed98.png',
  tuskmon: '4545c1113c2742541bfa287e8aaad34d540d5188.png',
  ultimatebrachiomon: 'cfe5f78d2ba5745cf2fab94f2ea9e70d1b5bfc0a.png',
  gaioumon: '797dcc096094cec27969dafb7d0d37cddbe6a1d5.png',
  bakemon: 'cc04120f94ce0a4ae081b26d2359ca0dd7488f6d.png',
  digitamamon: '15b86f9a6a117217f92fc8c35383b8ba7a68d995.png',
  gigadramon: '61935125c675c3d79b74bdfbb783563de187250a.png',
  titamon: '2289f0ba6bd5182e66b3253be305d6860dbe1148.png',
  'gaioumon-itto': '2f5fefb3d68da3d20ef1d5195a8f0ddc506b1149.png',
  chicomon: '4d2fa6b5f39afed1e868edf4c8faf3c4888ecc84.png',
  chibimon: '3b47f9d0035dbc50ffa6a78567bf904fc56834d6.png',
  veemon: '17701dd96050e16b1fac593a32079ae86e5bd531.png',
  exveemon: '136cb8d464cc8d648c7de82119ca05f5c5396af5.png',
  paildramon: 'bfde95df2c77e342ddcf05bd6a8480711ea5a740.png',
  imperialdramon: '701f6bc49c8ab4166c27d7c362af3194b202a330.png',
  veedramon: 'dcf2429f06e823eb567e0018e2d2de9887b5c034.png',
  aeroveedramon: 'e276464f1870730b1e5cb5dfbed9d586df28d609.png',
  ulforceveedramon: '7bdcafe95cc603bba49f20349fe242e981ddf8ec.png',
  flamedramon: 'b75ac337773a9cbda275e4994894104282fe9943.png',
  raidramon: '4fc596d119266f4125b18733231e3f326f163b28.png',
  'raidramon-armor': '4fc596d119266f4125b18733231e3f326f163b28.png',
  magnamon: '46ea13627a0da430619fa9e993f7d14bb613d5f8.png',
  'imperialdramon-paladin': '8ad9573c77b42ea0708b5b29032a7489c7616571.png',
  yukimibotamon: 'eb90dd429719211430c96bfff0ab33ce4263dc33.png',
  nyaromon: '21c7ddc9f28cb93fb5e301b2bfb797ade7767403.png',
  plotmon: 'acf058298d9eb6312c16c5f296a808c2f4edc163.png',
  gatomon: 'cd6cdea0aaf4dea528d69cb4812333fe7980f034.png',
  angewomon: '91def178d3bb589f11cf012e72a30ed12f14ed5a.png',
  ophanimon: '0523e198a779637515f03904bb4baa992fdf837e.png',
  'gatomon-black': '6597e8c17a1647c444bdc1d375da54f07b1e8d45.png',
  ladydevimon: '6e5b9d1d2d1c049b40fcb76d3e31d0ed15713538.png',
  lilithmon: '4834d54b968cbf6223b91134a426afc867a9138a.png',
  mikemon: '79da08e63a9021eed7f83f46fafd43e36f1e30dd.png',
  nefertimon: '750c493568ac7846d39b203e8be583d896133c60.png',
  holydramon: '829e91e67710908cd0cecd99b5b12163536d3926.png',
  mastemon: 'a036d6071a61f5a7cde8ca604f58cd0267141481.png',
  greymon: 'greymon_dmc.png',
  garurumon: 'garurumon_dmc.png',
  meramon: 'meramon_dmc.png',
  monzaemon: 'monzaemon_dmc.png',
  etemon: 'etemon_dmc.png',
  agumon: 'agumon_dmc.png',
  patamon: 'patamon_dmc.png',
  palmon: 'palmon_dmc.png',
  betamon: 'betamon_dmc.png',
  birdramon: 'birdramon_dmc.png',
  kabuterimon: 'kabuterimon_dmc.png',
  angemon: 'angemon_dmc.png',
  devimon: 'devimon_dmc.png',
  airdramon: 'airdramon_dmc.png',
  seadramon: 'seadramon_dmc.png',
  kuwagamon: 'kuwagamon_dmc.png',
  ogremon: 'ogremon_dmc.png',
  numemon: 'numemon_dmc.png',
  megadramon: 'megadramon_dmc.png',
  andromon: 'andromon_dmc.png',
  vademon: 'vademon_dmc.png',
  nanimon: 'nanimon_dmc.png',
  gabumon: 'gabumon_dmc.png',
  piyomon: 'piyomon_dmc.png',
  tentomon: 'tentomon_dmc.png',
};

async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  let done = 0;
  for (const [stage, file] of Object.entries(STAGE_SOURCE_FILE)) {
    const input = path.join(ASSETS_DIR, file);
    const output = path.join(OUT_DIR, `${stage}.png`);
    try {
      await sharp(input)
        .resize(SIZE, SIZE, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .png({ compressionLevel: 9 })
        .toFile(output);
      done++;
    } catch (err) {
      console.error(`  ✗ ${stage} (${file}): ${err.message}`);
    }
  }

  console.log(`Generated ${done}/${Object.keys(STAGE_SOURCE_FILE).length} notification icons in ${OUT_DIR}/`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
