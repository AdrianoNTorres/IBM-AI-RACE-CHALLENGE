# Car models

From **Car Kit 3.1** by Kenney (www.kenney.nl), public domain (Creative Commons Zero, CC0): see `License.txt`, the kit's own licence file. Five of its cars are here unchanged, with the one picture of colour swatches they share (`Textures/colormap.png`): `race.glb` (Formula), `race-future.glb` (Future racer), `sedan-sports.glb` (Sports sedan), `hatchback-sports.glb` (Hot hatch), `kart-oobi.glb` (Kart).

The 3D view (`viewer/js/view3d.js`) loads the one the reader picks, turns its paint into the run's colour, steers its front wheels and turns all four. To add another car from the kit, copy its `.glb` here and add a line to `CARS` in `view3d.js`; its parts must be named `body` and `wheel-front-left` and so on, as the kit names them.
