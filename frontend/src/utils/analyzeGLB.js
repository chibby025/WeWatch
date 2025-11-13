// Temporary utility to analyze the user_3d_icon.glb structure
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const loader = new GLTFLoader();

loader.load('/models/user_3d_icon.glb', (gltf) => {
  console.log('=== GLB Analysis ===');
  console.log('Scene:', gltf.scene);
  
  gltf.scene.traverse((child) => {
    if (child.isMesh) {
      console.log('\n--- Mesh:', child.name || 'Unnamed');
      console.log('Geometry vertices:', child.geometry.attributes.position.count);
      console.log('Material:', child.material.name || 'Unnamed Material');
      console.log('Material type:', child.material.type);
      console.log('Has UV:', !!child.geometry.attributes.uv);
      console.log('Position:', child.position);
      console.log('Scale:', child.scale);
    }
  });
  
  console.log('\n=== Materials ===');
  const materials = [];
  gltf.scene.traverse((child) => {
    if (child.material && !materials.includes(child.material)) {
      materials.push(child.material);
      console.log('Material:', child.material.name);
      console.log('  Type:', child.material.type);
      console.log('  Color:', child.material.color);
      console.log('  Map:', child.material.map);
    }
  });
}, undefined, (error) => {
  console.error('Error loading GLB:', error);
});
