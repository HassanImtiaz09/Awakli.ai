/**
 * Seraphis Recognition — Stage 1-2: Create episode + Generate 32 keyframe panel images
 * 
 * This script:
 * 1. Creates Episode 2 "The Seraphis Recognition" in the DB
 * 2. Creates all 32 panel records with timecodes and prompts
 * 3. Generates keyframe images for all 32 panels via FLUX
 * 4. Uploads to S3 and updates panel records
 */

import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const pool = mysql.createPool(process.env.DATABASE_URL);
const FORGE_URL = process.env.BUILT_IN_FORGE_API_URL;
const FORGE_KEY = process.env.BUILT_IN_FORGE_API_KEY;

// ─── Panel definitions (all 32) ───
const panels = [
  // Act 1 — Infiltration (0:00-0:20)
  {
    id: 'P01', act: 1, scene: 1, panelNum: 1,
    tcIn: '0:00.0', tcOut: '0:03.0', dur: 3.0,
    shot: 'EWS / PUSH slow', aspect: '16:9',
    prompt: `Cinematic anime establishing shot, extreme wide. An imperial observation station built into a sheer cliff face, minimalist white modular architecture cantilevered over a dark ocean. Red sun setting low on horizon, station silhouetted against a dusky red-orange sky with violet gradient. White caps crashing at cliff base far below. Salt spray haze. Dramatic depth, atmospheric perspective. Slow forward push. Cel-shaded detail, realistic lighting, no characters in frame, no text, no logos.`,
    negative: `characters, people, figures, manga panel, screentone, halftone, black and white, line art only, text, watermark, signature, low quality, blurry, extra moons, surreal architecture, bright daylight, cheerful, warm cozy, pastel`,
    dialogue: null, character: null, colorRegime: 'R-EXTERIOR',
    description: 'Cliff-face exterior of Imperial observation station at dusk. Red sun setting behind silhouette. Waves crashing at base. No characters.'
  },
  {
    id: 'P02', act: 1, scene: 1, panelNum: 2,
    tcIn: '0:03.0', tcOut: '0:06.5', dur: 3.5,
    shot: 'WS / HOLD', aspect: '16:9',
    prompt: `Cinematic anime wide shot, four black silhouettes descending by stealth cable onto a white imperial station service deck at dusk, wind-torn cloaks billowing, a woman commander leads followed by a young man with dark hair, then a broad-shouldered red-haired soldier and a slender dark-skinned operative at rear, red-orange sunset sky with violet gradient behind, no emergency lights yet, atmospheric perspective, dramatic scale, realistic cel shading, full color anime cel`,
    negative: `bright daylight, cheerful, manga panel, screentone, halftone, black and white, text, watermark`,
    dialogue: null, character: null, colorRegime: 'R-EXTERIOR',
    description: 'Four black silhouettes descending by stealth cable. Ilyra lead, Kaelis second, Rook third, Vern rear.'
  },
  {
    id: 'P03', act: 1, scene: 1, panelNum: 3,
    tcIn: '0:06.5', tcOut: '0:09.5', dur: 3.0,
    shot: 'MCU / TILT down', aspect: '16:9',
    prompt: `kaelis_v1, cinematic anime medium close-up, 19 year old Kaelis Vael, dark almost-black hair jaw-length layered, cold pale gray eyes scanning forward intensely, pale skin, thin silver scar ring around throat dormant, black matte tactical infiltration suit, gloved hand entering frame at bottom with fingers curling inward unconsciously, red emergency strobe lighting from above pulsing, corridor environment dimly suggested behind, composition tilts from face down to hands, realistic cel shading, atmospheric rim light on cheekbone, no manga screentone, full color anime cel`,
    negative: `red hair, blonde hair, brown hair, bright eyes, smiling, open-mouth expression, bright colors, manga panel, black and white, screentone, halftone, ink wash, low detail, blurry, extra fingers, warped hands, armor plates, medieval, fantasy, sword, shield, magical`,
    dialogue: null, character: 'Kaelis', colorRegime: 'R-COLD',
    description: 'Face reveal: Kaelis, hood thrown back, cold gray eyes scanning. Camera tilts to gloved hands flexing, fingers curling. Scar dormant silver.'
  },
  {
    id: 'P04', act: 1, scene: 1, panelNum: 4,
    tcIn: '0:09.5', tcOut: '0:12.0', dur: 2.5,
    shot: 'WS / WHIP PAN', aspect: '16:9',
    prompt: `Cinematic anime wide shot with whip pan motion blur, four operatives in black tactical suits profiled against sudden red emergency klaxon strobe wash in an imperial service corridor, clinical white walls scuffed, low ceiling with exposed cable runs, the woman commander at front giving an arm signal, red light pulsing at 0.5Hz casting harsh shadows, motion blur streaks from whip pan left-to-right, realistic cel shading, full color anime cel, atmospheric tension`,
    negative: `bright daylight, cheerful, manga panel, screentone, halftone, black and white, text, watermark, blurry, low quality`,
    dialogue: 'Ilyra (comms): "Team two by two"', character: 'Ilyra', colorRegime: 'R-STROBE',
    description: 'Corridor entry. Red klaxon strobes fire. Team profile against red wash. Whip pan following Ilyra arm-signal.'
  },
  {
    id: 'P05', act: 1, scene: 1, panelNum: 5,
    tcIn: '0:12.0', tcOut: '0:15.5', dur: 3.5,
    shot: 'OTS Ilyra / TRACK fwd', aspect: '16:9',
    prompt: `Cinematic anime over-the-shoulder shot tracking forward, foreground is the back of a woman commander in black tactical suit (dark brown short hair), mid-ground is a young man in black matte tactical suit advancing in point position down a red-lit imperial service corridor, red emergency strobes pulsing overhead, clinical white walls, low ceiling, cable runs visible, matte black suits absorbing light reading as moving absence, one-point perspective, realistic cel shading, full color anime cel, atmospheric tension`,
    negative: `bright colors, cheerful, manga panel, screentone, halftone, black and white, text, watermark`,
    dialogue: 'Ilyra (comms): "Weapons hot"', character: 'Ilyra', colorRegime: 'R-STROBE',
    description: 'Tactical advance down corridor. OTS past Ilyra, Kaelis visible ahead in point position. Red strobes pulse.'
  },
  {
    id: 'P06', act: 1, scene: 1, panelNum: 6,
    tcIn: '0:15.5', tcOut: '0:20.0', dur: 4.5,
    shot: 'POV Kaelis / PUSH', aspect: '16:9',
    prompt: `kaelis_v1 partial, cinematic anime first-person POV, advancing perspective down service corridor, gloved hands of wearer at bottom edge of frame one raised in hold-gesture, teammates visible in peripheral vision: a woman commander silhouette at left with hand raised signal, a rifleman at right, a scanner-tech figure at rear, red emergency klaxon strobes pulsing overhead, motion blur subtle, one-point perspective strong, cable runs on walls, clinical white walls scuffed, low ceiling, breath fog subtle in cold air, realistic cel shading, full color anime cel, atmospheric tension`,
    negative: `bright colors, cheerful, manga panel, screentone, halftone, black and white, text, watermark`,
    dialogue: null, character: 'Kaelis', colorRegime: 'R-STROBE',
    description: 'Kaelis POV advancing. Peripheral vision: Ilyra hand signal, Rook rifle, Vern scanner. Breath sync.'
  },
  // Act 2 — Contact (0:20-0:50)
  {
    id: 'P07', act: 2, scene: 2, panelNum: 7,
    tcIn: '0:20.0', tcOut: '0:22.5', dur: 2.5,
    shot: 'CU / WHIP IN', aspect: '16:9',
    prompt: `Cinematic anime close-up with sudden zoom, a white-armored imperial guard rounding a corridor corner, visored helmet with glinting visor, rifle raised, red emergency strobe hitting white armor turning it pink-white, dramatic lighting contrast, sudden zoom-in on visor reflection, red-lit imperial corridor behind, realistic cel shading, full color anime cel, tension and threat`,
    negative: `manga panel, screentone, halftone, black and white, text, watermark, blurry`,
    dialogue: null, character: 'Guard-1', colorRegime: 'R-STROBE',
    description: 'Guard-1 rounding corner. Visor glint. Rifle raised. Red strobe hits armor pink-white.'
  },
  {
    id: 'P08', act: 2, scene: 2, panelNum: 8,
    tcIn: '0:22.5', tcOut: '0:25.0', dur: 2.5,
    shot: 'WS / HOLD', aspect: '16:9',
    prompt: `Cinematic anime wide shot, a broad-shouldered red-haired soldier in black tactical suit firing a suppressed shot at a white-armored imperial guard in a red-lit corridor, guard falling with armor clattering on metal floor, a woman commander behind already signaling advance with hand gesture, red emergency strobes pulsing, clinical white walls, realistic cel shading, full color anime cel, action moment`,
    negative: `manga panel, screentone, halftone, black and white, text, watermark, bright colors`,
    dialogue: null, character: 'Rook', colorRegime: 'R-STROBE',
    description: 'Rook drops Guard-1 with suppressed shot. Guard falls, armor clatter. Ilyra signals advance.'
  },
  {
    id: 'P09', act: 2, scene: 2, panelNum: 9,
    tcIn: '0:25.0', tcOut: '0:28.0', dur: 3.0,
    shot: 'MS / TRACK lateral', aspect: '16:9',
    prompt: `kaelis_v1, cinematic anime medium shot tracking laterally, 19 year old Kaelis Vael in black matte tactical suit moving past a fallen white-armored guard body at a controlled pace, not looking down, gait economical and inhuman in efficiency, dark almost-black hair, cold pale gray eyes forward, thin silver scar at throat dormant, red emergency strobe lighting pulsing, corridor environment, camera tracking sideways with him, realistic cel shading, full color anime cel`,
    negative: `looking at body, emotional expression, manga panel, screentone, halftone, black and white, text, watermark`,
    dialogue: null, character: 'Kaelis', colorRegime: 'R-STROBE',
    description: 'Kaelis moves past body, not looking down. Gait economical, inhuman efficiency.'
  },
  {
    id: 'P10', act: 2, scene: 2, panelNum: 10,
    tcIn: '0:28.0', tcOut: '0:31.0', dur: 3.0,
    shot: 'WS / WHIP', aspect: '16:9',
    prompt: `Cinematic anime wide shot with whip pan, a concealed door in a red-lit imperial corridor suddenly opening revealing a white-armored guard firing, bright muzzle flash at left edge of frame, whip pan following the trajectory toward a team of black-suited operatives, red emergency strobes, clinical white walls, motion blur from whip pan, realistic cel shading, full color anime cel, sudden violence`,
    negative: `manga panel, screentone, halftone, black and white, text, watermark`,
    dialogue: null, character: 'Guard-2', colorRegime: 'R-STROBE',
    description: 'Guard-2 ambush: concealed door opens, fires. Muzzle flash at left edge.'
  },
  {
    id: 'P11', act: 2, scene: 2, panelNum: 11,
    tcIn: '0:31.0', tcOut: '0:33.5', dur: 2.5,
    shot: 'CU / HOLD', aspect: '16:9',
    prompt: `Cinematic anime close-up, a broad-shouldered young man with short-cropped red hair and light freckles in black tactical suit, hit in the shoulder non-fatally, snarling in pain, dropping to a knee against a corridor wall, red emergency strobe lighting, blood on shoulder area, realistic cel shading, full color anime cel, pain and determination`,
    negative: `manga panel, screentone, halftone, black and white, text, watermark, smiling`,
    dialogue: 'Ilyra: "Vern, hold here."', character: 'Rook', colorRegime: 'R-STROBE',
    description: 'Rook hit — shoulder, non-fatal. Snarl of pain. Ilyra: "Vern, hold here."'
  },
  {
    id: 'P12', act: 2, scene: 2, panelNum: 12,
    tcIn: '0:33.5', tcOut: '0:38.5', dur: 5.0,
    shot: 'MS->CU / ORBIT 180', aspect: '16:9',
    prompt: `kaelis_v1, cinematic anime action sequence, 19 year old Kaelis Vael in black tactical suit executing a precise three-strike disarm on a white-armored imperial guard, motion flowing left to right, wrist lock into rifle redirect into knife-hand strike at throat gap, camera orbiting 180 degrees around the pair, red emergency strobe lighting with motion blur streaks, blood implied not shown, guard body beginning to fall, scar at Kaelis's throat flickering brief cyan glow on final strike, dark hair in motion, cold gray eyes focused not angry, realistic cel shading, full color anime cel, dynamic composition, fluid animation keyframe`,
    negative: `manga panel, screentone, halftone, black and white, text, watermark, extra fingers, warped hands`,
    dialogue: null, character: 'Kaelis', colorRegime: 'R-STROBE',
    description: 'Kaelis closes on Guard-2. Three strikes in 2s. Camera orbits 180. Scar flickers cyan 2 frames.'
  },
  {
    id: 'P13', act: 2, scene: 2, panelNum: 13,
    tcIn: '0:38.5', tcOut: '0:44.0', dur: 5.5,
    shot: 'OTS Ilyra / PUSH slow', aspect: '16:9',
    prompt: `kaelis_v1, cinematic anime over-the-shoulder shot, foreground is the back-right shoulder of a woman commander (Ilyra, early 30s, dark brown short hair, black tactical suit), mid-ground is Kaelis standing over a fallen white-armored guard in a red-lit imperial corridor, Kaelis's right hand is half raised palm-toward-himself and his gloved fingers are curling slightly inward as if he is looking at his own hand and does not recognize it, his expression is blank but his cold gray eyes are slightly widened, the commander's partial profile shows her eyes narrowing as she observes him, slow push in, red strobe pulsing, realistic cel shading, full color anime cel, subtle emotional tension, realistic anatomy, no manga screentone`,
    negative: `aggressive expression, angry face, shouting, open mouth, dramatic pose, extra fingers, warped hands, manga panel, black and white, screentone, halftone, cartoonish, chibi, bright colors`,
    dialogue: null, character: 'Kaelis', colorRegime: 'R-STROBE',
    description: 'HOLD-FLAG. Kaelis standing over fallen guard, hand half-raised in recognition. Ilyra eyes narrowing.'
  },
  {
    id: 'P14', act: 2, scene: 2, panelNum: 14,
    tcIn: '0:44.0', tcOut: '0:50.0', dur: 6.0,
    shot: 'MS / PUSH + hiss', aspect: '16:9',
    prompt: `kaelis_v1, cinematic anime medium shot, end of a red-lit imperial corridor, a heavy chamber door with amber backlight visible through the seams, a white-armored guard slumped beside the door control panel, Kaelis in black tactical suit standing over the guard having just disabled him through the panel, the door beginning to release with hydraulic hiss, beyond the opening door cyan-green bioluminescent light spills into the red corridor creating a dramatic color transition, realistic cel shading, full color anime cel, atmospheric tension, transition moment`,
    negative: `manga panel, screentone, halftone, black and white, text, watermark, bright cheerful`,
    dialogue: null, character: 'Kaelis', colorRegime: 'R-STROBE',
    description: 'Chamber door, amber-backlit. Guard-3 takedown. Door hiss. Cyan-green light spills in.'
  },
  // Act 3 — Threshold (0:50-1:20) — 2.39:1 letterbox
  {
    id: 'P15', act: 3, scene: 3, panelNum: 15,
    tcIn: '0:50.0', tcOut: '0:53.5', dur: 3.5,
    shot: 'MS / HOLD + ASPECT', aspect: '2.39:1',
    prompt: `kaelis_v1, cinematic anime medium shot, 2.39:1 widescreen aspect ratio, Kaelis in black tactical suit standing in silhouette at a doorway threshold, cyan-green bioluminescent light spilling around his figure from the chamber beyond, red corridor lighting behind him cooling as the door opens, dramatic color transition from red to cyan, the figure caught between two worlds of light, realistic cel shading, full color anime cel, atmospheric, liminal moment`,
    negative: `manga panel, screentone, halftone, black and white, text, watermark, bright cheerful`,
    dialogue: null, character: 'Kaelis', colorRegime: 'TRANSITION',
    description: 'CUT to 2.39:1. Kaelis silhouette at doorway. Cyan-green light spills around him. Red corridor behind.'
  },
  {
    id: 'P16', act: 3, scene: 3, panelNum: 16,
    tcIn: '0:53.5', tcOut: '0:56.5', dur: 3.0,
    shot: 'EWS / HOLD', aspect: '2.39:1',
    prompt: `Cinematic anime extreme wide shot, 2.39:1 widescreen aspect ratio, a circular observation chamber with domed ceiling, a massive curved crystal-alloy viewing wall opposite the entrance overlooking a vast bioluminescent crystal ocean, cyan-green glow filling the space, a small dark silhouette of a person at the entrance, a raised central dais with monitoring terminals glowing amber, the chamber is unexpectedly small while the ocean beyond is unexpectedly vast, realistic cel shading, full color anime cel, atmospheric, awe-inducing scale contrast`,
    negative: `manga panel, screentone, halftone, black and white, text, watermark, bright saturated primary colors`,
    dialogue: null, character: null, colorRegime: 'C-CYAN',
    description: 'Chamber revealed: circular room, crystal-alloy wall, ocean visible. Kaelis small silhouette. Data core amber on dais.'
  },
  {
    id: 'P17', act: 3, scene: 3, panelNum: 17,
    tcIn: '0:56.5', tcOut: '1:00.0', dur: 3.5,
    shot: 'MS / DOLLY fwd', aspect: '2.39:1',
    prompt: `kaelis_v1, cinematic anime medium shot, 2.39:1 widescreen aspect, Kaelis stepping into a circular observation chamber, his pace visibly slowing, his attention drawn to the massive crystal-alloy viewing wall ahead showing the bioluminescent ocean, behind him a woman commander (Ilyra, dark brown short hair, black tactical suit) enters with weapon still raised scanning the room, cyan-green ambient light, amber terminal backlights, realistic cel shading, full color anime cel, atmospheric, the contrast between her tactical alertness and his mesmerized stillness`,
    negative: `manga panel, screentone, halftone, black and white, text, watermark`,
    dialogue: null, character: 'Kaelis', colorRegime: 'C-CYAN',
    description: 'Kaelis steps in. Pace slows. Ilyra enters behind, weapon up, scanning. Kaelis looking at the glass.'
  },
  {
    id: 'P18', act: 3, scene: 3, panelNum: 18,
    tcIn: '1:00.0', tcOut: '1:05.0', dur: 5.0,
    shot: 'EWS thru glass / HOLD', aspect: '2.39:1',
    prompt: `Cinematic anime establishing shot, 2.39:1 widescreen aspect ratio, extreme wide beauty shot through curved crystal-alloy transparent wall looking out over a vast bioluminescent crystal ocean, viscous cyan-green surface rippling at breath scale, massive submerged Aethrosian spiral structures glowing softly in violet-indigo depths, scale cues suggest structures are half a kilometer across, horizon indistinct as ocean meets bioluminescent sky, amber highlights where surface refracts ambient light, atmospheric, sublime, awe-inducing, no characters in frame, no text, no watermark, realistic cel shading with painterly background detail, full color anime cel, dreamlike but real`,
    negative: `characters, people, figures, manga panel, screentone, halftone, black and white, line art only, text, watermark, signature, low detail, flat, cartoonish, chibi, bright saturated primary colors, daylight, cheerful`,
    dialogue: null, character: null, colorRegime: 'C-CYAN',
    description: 'HOLD-FLAG. Pure beauty shot. Crystal ocean fills frame. Submerged Aethrosian spirals pulse. No characters.'
  },
  {
    id: 'P19', act: 3, scene: 3, panelNum: 19,
    tcIn: '1:05.0', tcOut: '1:08.5', dur: 3.5,
    shot: 'OTS Kaelis / PUSH slow', aspect: '2.39:1',
    prompt: `kaelis_v1, cinematic anime over-the-shoulder shot, 2.39:1 widescreen aspect, back of Kaelis's head in foreground, dark almost-black jaw-length hair, the vast bioluminescent crystal ocean fills the glass wall ahead, cyan-green glow, his right hand beginning to rise toward the glass unconsciously, he has not decided to raise it, the ocean's light catches the side of his face, realistic cel shading, full color anime cel, atmospheric, slow push in, quiet anticipation`,
    negative: `manga panel, screentone, halftone, black and white, text, watermark`,
    dialogue: null, character: 'Kaelis', colorRegime: 'C-CYAN',
    description: 'Back of Kaelis head. Ocean fills glass. His hand starting to rise.'
  },
  {
    id: 'P20', act: 3, scene: 3, panelNum: 20,
    tcIn: '1:08.5', tcOut: '1:11.5', dur: 3.0,
    shot: 'MCU Ilyra / HOLD', aspect: '2.39:1',
    prompt: `Cinematic anime medium close-up, 2.39:1 widescreen aspect, a woman commander in her early 30s (Ilyra Venn, dark brown short pragmatic hair, pale ice-blue watchful eyes, neutral olive skin, black tactical infiltration suit with small matte commander insignia on left chest), her weapon lowering as she watches something off-frame, her expression shifting from commander-on-mission to observer-of-a-private-moment, cyan-green ambient light from the crystal ocean, comms earpiece visible, realistic cel shading, full color anime cel, subtle emotional shift`,
    negative: `manga panel, screentone, halftone, black and white, text, watermark, smiling, happy`,
    dialogue: null, character: 'Ilyra', colorRegime: 'C-CYAN',
    description: 'Ilyra watching Kaelis. Weapon lowers. Expression shifts to observer-of-a-private-moment.'
  },
  {
    id: 'P21', act: 3, scene: 3, panelNum: 21,
    tcIn: '1:11.5', tcOut: '1:15.5', dur: 4.0,
    shot: 'CU Kaelis / PUSH micro', aspect: '2.39:1',
    prompt: `kaelis_v1, cinematic anime close-up, 2.39:1 widescreen aspect, 19 year old Kaelis Vael's face filling most of frame, dark almost-black hair layered, cold pale gray eyes with subtle blue undertone from ambient cyan light, pale skin, thin silver scar ring around throat beginning to glow with faint inner cyan light, expression blank on the surface but a tiny tremor in the jaw and a subtle widening of the eyes reveal the first crack in his conditioning, cyan-green bioluminescent ambient light from off-frame right, slow push-in camera micro-movement, realistic cel shading, full color anime cel, atmospheric, emotional interiority visible through restraint, no manga screentone, no bright saturated colors, subtle beauty`,
    negative: `red hair, blonde hair, brown hair, bright eyes, smiling, open-mouth, bright colors, manga panel, black and white, screentone, halftone, cartoonish, chibi`,
    dialogue: null, character: 'Kaelis', colorRegime: 'C-CYAN',
    description: 'Kaelis face. Jaw tremor. Eyes reading, not scanning. Scar warms to faint cyan.'
  },
  {
    id: 'P22', act: 3, scene: 3, panelNum: 22,
    tcIn: '1:15.5', tcOut: '1:20.0', dur: 4.5,
    shot: 'CU hand + glass / TRACK', aspect: '2.39:1',
    prompt: `kaelis_v1 partial, cinematic anime close-up, 2.39:1 widescreen aspect, a gloved hand in black tactical glove reaching forward and touching a crystal-alloy glass wall, fingertips making contact with the surface, beyond the glass a vast bioluminescent crystal ocean with cyan-green glow and submerged spiral structures, the hand's reflection visible in the glass, camera tracking the motion of the hand, realistic cel shading, full color anime cel, atmospheric, intimate moment of contact`,
    negative: `manga panel, screentone, halftone, black and white, text, watermark, extra fingers, warped hands`,
    dialogue: null, character: 'Kaelis', colorRegime: 'C-CYAN',
    description: 'Gloved hand reaches forward, touches glass. Camera tracks motion. End of Act 3.'
  },
  // Act 4 — Recognition (1:20-1:50) — 2.39:1 letterbox
  {
    id: 'P23', act: 4, scene: 4, panelNum: 23,
    tcIn: '1:20.0', tcOut: '1:24.0', dur: 4.0,
    shot: 'ECU hand / HOLD', aspect: '2.39:1',
    prompt: `Cinematic anime extreme close-up, 2.39:1 widescreen aspect, fingertips in black tactical gloves pressed against a crystal-alloy glass wall, the vast bioluminescent crystal ocean visible through the glass behind the hand, cyan-green glow reflecting off the glove surface, the silhouette of the person faintly reflected in the glass, a thin silver scar ring at the throat area of the reflection glowing clearly cyan, a single slow breath visible as slight fog on the glass, realistic cel shading, full color anime cel, atmospheric, intimate`,
    negative: `manga panel, screentone, halftone, black and white, text, watermark, extra fingers`,
    dialogue: null, character: 'Kaelis', colorRegime: 'C-CYAN',
    description: 'Fingertips against glass. Ocean behind. Scar clearly cyan. Single slow breath.'
  },
  {
    id: 'P24', act: 4, scene: 4, panelNum: 24,
    tcIn: '1:24.0', tcOut: '1:27.0', dur: 3.0,
    shot: 'ECU eye + flashback', aspect: '2.39:1',
    prompt: `kaelis_v1, cinematic anime extreme close-up, 2.39:1 widescreen aspect, Kaelis's right eye fills nearly the entire frame, iris is pale cold gray with subtle blue undertone from ambient cyan light, pupil is dilating slightly, reflected within the pupil is the vast crystal ocean with its submerged spiral structures, realistic cel shading, photoreal texture on iris while maintaining anime cel style, eyelash detail, one tear beginning at inner corner but not yet fallen, atmospheric cyan light, no manga screentone, no text, subtle, haunting`,
    negative: `manga panel, screentone, halftone, black and white, text, watermark, bright saturated colors`,
    dialogue: null, character: 'Kaelis', colorRegime: 'C-CYAN',
    description: 'Kaelis right eye ECU. Pupil reflects ocean. 0.4s amber ghost of mother at 1:24.5-1:24.9.'
  },
  {
    id: 'P25', act: 4, scene: 4, panelNum: 25,
    tcIn: '1:27.0', tcOut: '1:31.0', dur: 4.0,
    shot: 'MCU / PULL back slow', aspect: '2.39:1',
    prompt: `kaelis_v1, cinematic anime medium close-up, 2.39:1 widescreen aspect, Kaelis's upper body and face, the thin silver scar ring around his throat now glowing bright cyan pulsing visibly, his knees beginning to buckle, his hand still pressed against the crystal-alloy glass wall, the bioluminescent ocean visible beyond, camera beginning to pull back slowly, his expression cracking from blank to overwhelmed, dark almost-black hair, pale skin catching cyan glow, realistic cel shading, full color anime cel, atmospheric, somatic overload`,
    negative: `manga panel, screentone, halftone, black and white, text, watermark, melodrama, tears streaming`,
    dialogue: null, character: 'Kaelis', colorRegime: 'C-CYAN',
    description: 'Scar activates fully, 0.5Hz to 1.5Hz. Knees begin to buckle. Hand still on glass.'
  },
  {
    id: 'P26', act: 4, scene: 4, panelNum: 26,
    tcIn: '1:31.0', tcOut: '1:34.0', dur: 3.0,
    shot: 'MS->WS / PUSH then freeze', aspect: '2.39:1',
    prompt: `kaelis_v1, cinematic anime medium-to-wide shot, 2.39:1 widescreen aspect, Kaelis sliding down the crystal-alloy glass wall, his hand dragging downward leaving a faint trail, his body collapsing in slow motion, the vast bioluminescent crystal ocean behind the glass, cyan-green glow, his throat scar bright cyan, camera pushing in as if the world is closing around him, realistic cel shading, full color anime cel, atmospheric, the moment before the fall completes`,
    negative: `manga panel, screentone, halftone, black and white, text, watermark, action pose, aggressive`,
    dialogue: null, character: 'Kaelis', colorRegime: 'C-CYAN',
    description: 'Camera pushes in as music swells. Kaelis sliding down glass. Camera freezes at 1:33.8.'
  },
  {
    id: 'P27', act: 4, scene: 4, panelNum: 27,
    tcIn: '1:34.0', tcOut: '1:41.0', dur: 7.0,
    shot: 'MS / ABSOLUTE HOLD', aspect: '2.39:1',
    prompt: `kaelis_v1, cinematic anime medium shot, 2.39:1 widescreen aspect, Kaelis kneeling at the base of a floor-to-ceiling crystal-alloy glass wall that overlooks a vast bioluminescent crystal ocean, he is in a matte black tactical infiltration suit, his hands are lifted slightly from his thighs with fingers curling inward cupping empty air as if trying to hold something not there, his eyes are open but unfocused with faint moisture catching cyan ambient light, the thin silver scar ring around his throat is glowing bright cyan with slow steady pulse, his dark hair falls slightly over his forehead, his pale skin catches the cyan glow along the cheekbone rim, behind him and above through the glass the crystal ocean extends to the horizon with amber refractions and submerged spiral structures pulsing, shallow depth of field with him in perfect focus and background slightly soft, absolute camera stillness, realistic cel shading with painterly depth, atmospheric emotional weight, full color anime cel, no manga screentone, no text, no watermark, the stillness itself is the composition`,
    negative: `motion, camera shake, dynamic action pose, dramatic lighting, red lighting, warm colors dominating, multiple figures, action sequence, weapons visible, aggressive expression, shouting, open mouth, tears streaming, melodrama, manga panel, black and white, screentone, halftone, cartoonish, chibi, extra fingers, warped hands, overly saturated`,
    dialogue: null, character: 'Kaelis', colorRegime: 'C-CYAN',
    description: 'PEAK. Kaelis on knees at glass. Hands lifted, fingers curling, cupping nothing. Scar bright cyan. 7s hold.'
  },
  {
    id: 'P28', act: 4, scene: 4, panelNum: 28,
    tcIn: '1:41.0', tcOut: '1:45.0', dur: 4.0,
    shot: 'EWS / PULL extreme', aspect: '2.39:1',
    prompt: `Cinematic anime extreme wide shot, 2.39:1 widescreen aspect, pulling back to reveal a single small black figure (Kaelis) kneeling at the base of a massive crystal-alloy glass wall at bottom-center of frame, the vast bioluminescent crystal ocean fills everything else through the glass, cyan-green surface, massive submerged spiral structures pulsing deep violet-indigo, a second small figure (woman in black tactical suit) entering frame at left, the scale contrast between the tiny human figures and the vast ocean is the entire composition, realistic cel shading, full color anime cel, atmospheric, sublime`,
    negative: `manga panel, screentone, halftone, black and white, text, watermark, close-up, bright saturated`,
    dialogue: null, character: null, colorRegime: 'C-CYAN',
    description: 'Pull back: Kaelis small black figure at bottom-center. Ocean fills everything. Ilyra entering at left.'
  },
  {
    id: 'P29', act: 4, scene: 4, panelNum: 29,
    tcIn: '1:45.0', tcOut: '1:50.0', dur: 5.0,
    shot: 'MS / TRACK toward', aspect: '2.39:1',
    prompt: `Cinematic anime medium shot, 2.39:1 widescreen aspect, a woman commander (Ilyra, early 30s, dark brown short hair, pale ice-blue eyes, black tactical suit) walking slowly toward a kneeling figure at the base of a glass wall, camera tracking with her, she does not speak, her expression is decided, a woman who has just chosen something, cyan-green bioluminescent ambient from the ocean beyond the glass, weapon holstered, realistic cel shading, full color anime cel, atmospheric, quiet determination`,
    negative: `manga panel, screentone, halftone, black and white, text, watermark, aggressive, action`,
    dialogue: null, character: 'Ilyra', colorRegime: 'C-CYAN',
    description: 'Ilyra walks toward Kaelis slowly. Does not speak. Expression decided. End of Act 4.'
  },
  // Act 5 — Refusal (1:50-2:00) — back to 16:9
  {
    id: 'P30', act: 5, scene: 5, panelNum: 30,
    tcIn: '1:50.0', tcOut: '1:53.5', dur: 3.5,
    shot: 'MS / HOLD + ASPECT', aspect: '16:9',
    prompt: `kaelis_v1, cinematic anime medium shot, 16:9 aspect, Ilyra (early 30s, dark brown short hair, pale ice-blue eyes, black tactical suit) kneeling beside Kaelis (19, dark almost-black hair, pale skin, black tactical suit, throat scar glowing soft cyan), her hand on his shoulder, he does not look at her, the bioluminescent crystal ocean's cyan light fills the side of both their faces from the glass wall, comms chatter audible in her earpiece, realistic cel shading, full color anime cel, atmospheric, quiet connection, desaturated 30% cyan`,
    negative: `manga panel, screentone, halftone, black and white, text, watermark, bright saturated`,
    dialogue: 'Comms: Termination order confirmed', character: 'Kaelis', colorRegime: 'C-DESATURATE',
    description: 'CUT to 16:9. Ilyra kneels beside Kaelis. Hand on shoulder. Cyan light fills both faces. Comms: termination order.'
  },
  {
    id: 'P31', act: 5, scene: 5, panelNum: 31,
    tcIn: '1:53.5', tcOut: '1:57.5', dur: 4.0,
    shot: 'MCU two-shot / HOLD', aspect: '16:9',
    prompt: `kaelis_v1, cinematic anime medium close-up two-shot, 16:9 aspect, Kaelis kneeling at frame-right facing slightly toward frame-left, a woman commander (Ilyra, early 30s, dark brown short hair, pale ice-blue eyes, black tactical suit) kneeling at frame-left with her hand on his shoulder, they are both lit from behind by cyan bioluminescent ambient from the crystal ocean through the glass wall, Kaelis's expression is stunned and quiet not crying, his one hand resting open on his thigh fingers relaxed, his throat scar sustains a soft cyan glow, the commander's face shows decided tenderness, neither is speaking in this moment, realistic cel shading, full color anime cel, subtle emotional weight, no manga screentone, no text, quiet`,
    negative: `aggressive, shouting, open mouth, tears streaming, melodrama, manga panel, black and white, screentone, halftone, cartoonish, chibi, extra fingers`,
    dialogue: 'Kaelis: "I remember."', character: 'Kaelis', colorRegime: 'C-DESATURATE',
    description: 'Kaelis turns slightly. Line: "I remember." Hand open now. Scar glow sustained.'
  },
  {
    id: 'P32', act: 5, scene: 5, panelNum: 32,
    tcIn: '1:57.5', tcOut: '2:00.0', dur: 2.5,
    shot: 'WS / PULL back', aspect: '16:9',
    prompt: `kaelis_v1, cinematic anime wide shot, 16:9 aspect, two figures in black tactical suits rising to their feet in a circular observation chamber, the woman (Ilyra) reaching to her comms earpiece switching it off, the young man (Kaelis) beside her, both lit by cyan bioluminescent light from the vast crystal ocean visible through the glass wall behind them, they turn toward the chamber door, the scene fading, desaturated color palette, realistic cel shading, full color anime cel, atmospheric, quiet resolution, fade to black`,
    negative: `manga panel, screentone, halftone, black and white, text, watermark, bright saturated, action`,
    dialogue: null, character: null, colorRegime: 'C-DESATURATE',
    description: 'Both rising. Ilyra switches off comms. Fade to black.'
  }
];

// ─── Image generation function ───
async function generateImage(prompt) {
  const baseUrl = FORGE_URL.endsWith('/') ? FORGE_URL : `${FORGE_URL}/`;
  const fullUrl = new URL('images.v1.ImageService/GenerateImage', baseUrl).toString();
  
  const resp = await fetch(fullUrl, {
    method: 'POST',
    headers: {
      'accept': 'application/json',
      'content-type': 'application/json',
      'connect-protocol-version': '1',
      'authorization': `Bearer ${FORGE_KEY}`
    },
    body: JSON.stringify({
      prompt,
      original_images: []
    })
  });
  if (!resp.ok) throw new Error(`Image gen failed: ${resp.status} ${await resp.text()}`);
  const result = await resp.json();
  // Returns base64 — decode and upload to S3
  const base64Data = result.image.b64Json;
  const buffer = Buffer.from(base64Data, 'base64');
  return { buffer, mimeType: result.image.mimeType || 'image/png' };
}

// ─── S3 upload function ───
async function uploadToS3(imgBuffer, fileKey, contentType = 'image/png') {
  // Upload via native FormData (Node 18+)
  const blob = new Blob([imgBuffer], { type: contentType });
  const form = new FormData();
  form.append('file', blob, `${fileKey}.png`);
  
  const uploadResp = await fetch(`${FORGE_URL}/v1/storage/upload?path=${encodeURIComponent(fileKey)}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${FORGE_KEY}`
    },
    body: form
  });
  if (!uploadResp.ok) {
    const errText = await uploadResp.text().catch(() => '');
    throw new Error(`S3 upload failed: ${uploadResp.status} ${errText}`);
  }
  const result = await uploadResp.json();
  return result.url;
}

// ─── Main ───
async function main() {
  const PROJECT_ID = 1;
  
  // Step 1: Create Episode 2
  console.log('=== Creating Episode 2: The Seraphis Recognition ===');
  const [existingEp] = await pool.query(
    `SELECT id FROM episodes WHERE projectId = ? AND episodeNumber = 2`, [PROJECT_ID]
  );
  
  let episodeId;
  if (existingEp.length > 0) {
    episodeId = existingEp[0].id;
    console.log(`Episode 2 already exists (ID: ${episodeId}), reusing`);
  } else {
    const [result] = await pool.query(
      `INSERT INTO episodes (projectId, episodeNumber, title, synopsis, status, createdAt, updatedAt)
       VALUES (?, 2, 'The Seraphis Recognition', 'Kaelis infiltrates an Aethrosian observatory on Seraphis. When he sees the crystal ocean, his conditioning breaks — he remembers.', 'locked', NOW(), NOW())`,
      [PROJECT_ID]
    );
    episodeId = result.insertId;
    console.log(`Created Episode 2 (ID: ${episodeId})`);
  }
  
  // Step 2: Create panel records
  console.log('\n=== Creating 32 panel records ===');
  for (const p of panels) {
    const [existing] = await pool.query(
      `SELECT id FROM panels WHERE episodeId = ? AND panelNumber = ?`, [episodeId, p.panelNum]
    );
    
    if (existing.length > 0) {
      console.log(`  Panel ${p.id} already exists (ID: ${existing[0].id})`);
    } else {
      await pool.query(
        `INSERT INTO panels (episodeId, projectId, sceneNumber, panelNumber, visualDescription, cameraAngle, dialogue, sfx, transition, status, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'cut', 'approved', NOW(), NOW())`,
        [episodeId, PROJECT_ID, p.scene, p.panelNum, p.description, 'wide', p.dialogue ? JSON.stringify([{character: p.character || 'narrator', text: p.dialogue}]) : null, null]
      );
      console.log(`  Created panel ${p.id} (scene ${p.scene}, panel ${p.panelNum})`);
    }
  }
  
  // Step 3: Generate keyframe images for all 32 panels
  console.log('\n=== Generating 32 keyframe images ===');
  
  // Get all panel IDs
  const [panelRows] = await pool.query(
    `SELECT id, panelNumber, imageUrl FROM panels WHERE episodeId = ? ORDER BY panelNumber`, [episodeId]
  );
  
  let generated = 0;
  let skipped = 0;
  
  for (const panelRow of panelRows) {
    const panelDef = panels.find(p => p.panelNum === panelRow.panelNumber);
    if (!panelDef) continue;
    
    // Skip if already has an image
    if (panelRow.imageUrl) {
      console.log(`  ${panelDef.id}: Already has image, skipping`);
      skipped++;
      continue;
    }
    
    try {
      console.log(`  ${panelDef.id}: Generating keyframe...`);
      const { buffer, mimeType } = await generateImage(panelDef.prompt);
      
      // Upload to S3
      const fileKey = `seraphis/${panelDef.id.toLowerCase()}_keyframe`;
      const s3Url = await uploadToS3(buffer, fileKey, mimeType);
      
      // Update panel record
      await pool.query(
        `UPDATE panels SET imageUrl = ?, fluxPrompt = ?, negativePrompt = ?, updatedAt = NOW() WHERE id = ?`,
        [s3Url, panelDef.prompt, panelDef.negative || null, panelRow.id]
      );
      
      generated++;
      console.log(`  ${panelDef.id}: ✓ Generated and stored (${generated}/${panels.length - skipped} new)`);
    } catch (err) {
      console.error(`  ${panelDef.id}: ✗ FAILED — ${err.message}`);
    }
    
    // Small delay between generations to avoid rate limits
    await new Promise(r => setTimeout(r, 500));
  }
  
  console.log(`\n=== Summary ===`);
  console.log(`Generated: ${generated}`);
  console.log(`Skipped (already had image): ${skipped}`);
  console.log(`Total panels: ${panels.length}`);
  
  await pool.end();
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
