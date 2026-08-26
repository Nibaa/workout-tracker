# [1.7.0](https://github.com/Nibaa/workout-tracker/compare/v1.6.0...v1.7.0) (2026-08-26)


### Features

* show last exercise summary in workout views ([58630b1](https://github.com/Nibaa/workout-tracker/commit/58630b1fb8297c0459970f89ed0d25f554b018ac))

# [1.6.0](https://github.com/Nibaa/workout-tracker/compare/v1.5.1...v1.6.0) (2026-08-07)


### Features

* add split-local shared progression ([9124dbb](https://github.com/Nibaa/workout-tracker/commit/9124dbb9003fe766bd45ce74ba4b3fe66fd421be))

## [1.5.1](https://github.com/Nibaa/workout-tracker/compare/v1.5.0...v1.5.1) (2026-08-04)


### Bug Fixes

* reload superset exercise route state ([775140c](https://github.com/Nibaa/workout-tracker/commit/775140c40fd508a281fad860d5da35353fc14a07))

# [1.5.0](https://github.com/Nibaa/workout-tracker/compare/v1.4.0...v1.5.0) (2026-08-03)


### Features

* add myoreps and superset support ([64e2bac](https://github.com/Nibaa/workout-tracker/commit/64e2bac23f24f22bd9a60d2895710b60bd1d1fd0))

# [1.4.0](https://github.com/Nibaa/workout-tracker/compare/v1.3.2...v1.4.0) (2026-06-23)


### Features

* add notes, reminders, and deload ([e8950ef](https://github.com/Nibaa/workout-tracker/commit/e8950eff4f9ae5bb0bb33ba0535630b9ebe112a7))

## [1.3.2](https://github.com/Nibaa/workout-tracker/compare/v1.3.1...v1.3.2) (2026-06-23)


### Bug Fixes

* reset to rep baseline 6 after weight increase ([b6b2663](https://github.com/Nibaa/workout-tracker/commit/b6b26636db99d3591db097700a2234dec2e6c2b6))

## [1.3.1](https://github.com/Nibaa/workout-tracker/compare/v1.3.0...v1.3.1) (2026-06-19)


### Bug Fixes

* correct workout page const placement ([91ea83f](https://github.com/Nibaa/workout-tracker/commit/91ea83fcc9bbed430c5a36086d0408d76af21131))

# [1.3.0](https://github.com/Nibaa/workout-tracker/compare/v1.2.0...v1.3.0) (2026-06-18)


### Features

* use exercise list for mid-session additions ([1a27e17](https://github.com/Nibaa/workout-tracker/commit/1a27e17435338c82a5aef9a617d7a12fc554230f))

# [1.2.0](https://github.com/Nibaa/workout-tracker/compare/v1.1.0...v1.2.0) (2026-06-11)


### Bug Fixes

* carry forward rep targets at ceiling ([e613029](https://github.com/Nibaa/workout-tracker/commit/e613029bd69bfa94d86bee9348a0c423b34b990d))
* run release workflow on node 22 ([e1cb5f7](https://github.com/Nibaa/workout-tracker/commit/e1cb5f72b25112ad498f913936750756af04557f))
* treat heavier weights as progress ([396ee30](https://github.com/Nibaa/workout-tracker/commit/396ee308d434a520606a19c1efd648b61e05fb70))


### Features

* support custom exercises in active workouts ([5c50f26](https://github.com/Nibaa/workout-tracker/commit/5c50f26625121079c6468f4b90912d8e2471fe4d))

# Changelog

All notable changes to this project will be documented in this file.

## 1.1.0 - 2026-05-22

- Added support for viewing and editing both exercises in alternating split slots.
- Added support for logging both alternating exercises in the same workout session while still considering the slot done after the first finished log.
- Added automatic semantic versioning and release automation for future pushes to `main`.
