# RANDISH Mobile Structure

This folder is the maintainable app surface.

- `AppRoot.tsx`: current app shell and screen wiring. It is intentionally kept here while features are extracted gradually.
- `constants/`: shared colors and design tokens.
- `data/`: static catalog and municipality data.
- `services/`: API, native billing, native map adapters.
- `styles/`: React Native StyleSheet definitions.

Next extraction targets:

1. `features/home/`: home location setup, current-location card, area picker.
2. `features/random/`: roulette map, draw conditions, result card.
3. `features/analytics/`: monthly report and analysis UI.
4. `assets/`: app image registry so screen code does not directly require image files.

Keep root `App.tsx` thin. Expo loads that file, and it should only delegate to `src/AppRoot`.
