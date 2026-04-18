# Seraphis Recognition — Production Notes

## Executive Brief
- 120-second anime sequence, 32 panels across 5 acts
- Kaelis infiltrates Aethrosian observatory on Seraphis, conditioning breaks when he sees crystal ocean
- Target: 1080p 24fps H.264 MP4, yuv420p, stereo 48kHz AAC, EBU R128 -16 LUFS, true peak <= -1.5 dBTP
- Aspect: 16:9 for Acts 1,2,5; letterboxed 2.39:1 for Acts 3,4

## Characters
### Kaelis Vael (Principal - LoRA)
- LoRA: kaelis_v1 at weight 0.85 (Acts 1-3,5), 0.80 (Act 4 recognition panels)
- Trigger: kaelis_v1
- Age: 19, Hair: dark almost-black jaw-length layered, Eyes: cold pale gray (blue under bioluminescent)
- Skin: pale, Build: lean wiry tall-adjacent
- Throat scar: thin pale silver ring at thyroid level (dormant=silver, active=cyan glow)
- Signature gesture: fingers curl inward toward palms
- Outfit: black tactical infiltration suit, matte non-reflective, minimal harness, soft soled boots
- Voice: low flat controlled, 1 spoken line Act 5, Provider: Cartesia Sonic (but we'll use ElevenLabs)
- Emotional arc: blank-precise (1-2) -> opening awareness (3) -> somatic overload (4) -> stunned quiet (5)

### Ilyra Venn (Principal - prompt-locked)
- Age: early 30s, Hair: dark brown short pragmatic cut, Eyes: pale ice-blue
- Skin: neutral olive, Build: average athletic
- Outfit: matching tactical suit with commander insignia on left chest
- Signature: stillness — she is the one not moving
- Voice: measured alto, slight rasp, 4 lines, ElevenLabs
- Emotional arc: command-focused (1-2) -> concern (3) -> decision to protect (4) -> committed refusal (5)

### Squad Members (prompt-locked)
- Squad-1 (Rook): broad-shouldered, short-cropped red hair, light freckles, mid-20s
- Squad-2 (Vern): slender, shaved head, dark skin, tactical visor, mid-20s

### Imperial Guards (3, generic)
- Guard-1: white-armored, visored, rifle, faceless. Corridor patrol, Panel 8
- Guard-2: white-armored, visored, rifle, slightly taller. Panel 10, incapacitated Panel 12
- Guard-3: white-armored, visored, sidearm. Chamber door guard, Panel 13

### Flashback Ghost (Panel 22 only)
- Kaelis's mother, 0.4s amber chromatic aberration ghost at 1:24.5-1:24.9
- Screen at 40% opacity over crystal ocean reflection
- Prompt: woman early 30s, dark hair loose, calm love, amber sunset light, bioluminescent crystal forest

## Environments
### A - Service Corridor (Acts 1-2)
- Imperial observation station, clinical white walls, scuffed, red emergency strobes, low ceiling
- Prompt stem: Imperial service corridor, clinical white walls scuffed, red emergency strobe lighting pulsing, low ceiling, cable runs visible, one-point perspective, cinematic anime, realistic cel shading

### B - Observation Chamber (Acts 3-4)
- Circular room, domed ceiling, crystal-alloy viewing wall, central dais with terminals
- Cyan-green bioluminescence from crystal ocean, amber terminal backlights
- Prompt stem: Circular observation chamber, cantilevered glass crystal-alloy wall overlooking bioluminescent crystal ocean, cyan-green glow, amber terminal backlight, empty central dais, cinematic anime, realistic cel shading, atmospheric

### C - Crystal Ocean (featured view)
- Vast bioluminescent crystal water, submerged Aethrosian spiral structures
- Cyan dominant (#00B8C4 to #3DDCDC), violet-indigo depths (#1A0B5C), amber highlights
- Prompt stem: Vast bioluminescent crystal ocean, viscous cyan surface rippling, massive submerged Aethrosian spiral structures glowing, violet-indigo depths, amber refractions, indistinct horizon meeting bioluminescent sky, cinematic anime, atmospheric, breath-scale motion

## Throat Scar Progression
- Act 1: Dormant, faint silver ring, no glow
- Act 2: Dormant but flickering once at Panel 12 (kills Guard-2), single 2-frame cyan flicker
- Act 3: Intermittent glow, cyan pulses in sync with ocean bioluminescence
- Act 4: Full activation, steady cyan glow, brightens at somatic peak (1:34)
- Act 5: Slowly fading but still visible, the conditioning is permanently cracked

## Audio Architecture (4-bus)
- VOICE: Ilyra 4 lines (Acts 2,3,5), Kaelis 1 line (Act 5), comms chatter 3 bursts (Act 1) — target -20 LUFS
- MUSIC: (a) 0:00-0:50 tactical percussion + sub-bass, (b) 0:50-1:34 strings rising minor to open-fourth, (c) 1:34-2:00 sustained crystal drone — target -24 LUFS
- FOLEY: footsteps metal, cloth/armor, weapon impacts, door hiss, breath, crystal chimes — target -28 LUFS
- AMBIENT: crystal-ocean hum from 0:00 at -40 dBFS rising to -28 dBFS by Panel 15, sustaining — target -32 LUFS
- Silence budget: <= 12s total

## Pipeline Stages
1. Asset preparation (canon lock, environment boards, color script)
2. Storyboard and panel blocking (32 panels, animatic)
3. Keyframe generation (full quality, per-act sampler tiers)
4. Motion generation (Kling for action, 5-10s clips)
5. Audio production (4-bus mix)
6. Timeline assembly and final mux
7. QC and export
