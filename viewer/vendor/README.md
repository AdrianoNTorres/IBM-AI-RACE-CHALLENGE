# Third-party code kept with the site

| File | What | Version | Licence | From |
|---|---|---|---|---|
| `three.module.min.js` | Three.js, the 3D library the Track page's 3D view is drawn with (`js/view3d.js`) | r160 | MIT (the notice is at the top of the file) | `https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.min.js` |

| `loaders/GLTFLoader.js`, `utils/BufferGeometryUtils.js` | Three.js's own loader for `.glb` models and the helper it needs, for the car models in `viewer/models/` | r160 | MIT | `https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/loaders/GLTFLoader.js`, `.../examples/jsm/utils/BufferGeometryUtils.js` |

The two loader files name the library `three`; the import map at the top of `index.html` says where that is.

It is kept here, not loaded from a CDN, so the site works wherever it is published and for as long as the repository exists. The page loads it only when 3D is first switched on.
