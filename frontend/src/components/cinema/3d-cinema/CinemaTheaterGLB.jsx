// src/components/cinema/3d-cinema/CinemaTheaterGLB.jsx
import React, { useEffect, useRef } from 'react';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';

export default function CinemaTheaterGLB({ position = [0, 0, 0], videoElement }) {
  const { scene } = useGLTF('/models/cinema.glb');
  const videoPlaneRef = useRef();
  const videoTextureRef = useRef();

  if (!scene) return null;

  useEffect(() => {
    if (!videoElement || !scene) return;

    const width = 4.8;
    const height = width * (9 / 16);
    const geometry = new THREE.PlaneGeometry(width, height);
    const videoTexture = new THREE.VideoTexture(videoElement);
    videoTexture.minFilter = THREE.LinearFilter;
    videoTexture.magFilter = THREE.LinearFilter;
    videoTexture.encoding = THREE.sRGBEncoding;

    const material = new THREE.MeshBasicMaterial({
      map: videoTexture,
      side: THREE.DoubleSide,
      toneMapped: false
    });

    const plane = new THREE.Mesh(geometry, material);

    const worldPos = new THREE.Vector3(-3.49, 3.95, 2.26);
    const localPos = new THREE.Vector3();
    localPos.subVectors(worldPos, new THREE.Vector3(...position));
    plane.position.copy(localPos);
    plane.rotation.y = Math.PI;

    scene.add(plane);
    videoPlaneRef.current = plane;
    videoTextureRef.current = videoTexture;

    let frameId;
    const animate = () => {
      if (videoTextureRef.current && videoElement) {
        const isStream = videoElement.srcObject instanceof MediaStream;
        const isPlaying = !videoElement.paused && videoElement.currentTime > 0;

        if (isStream && isPlaying) {
          videoTextureRef.current.needsUpdate = true;
        }
      }
      frameId = requestAnimationFrame(animate);
    };
    frameId = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(frameId);
      scene.remove(plane);
      geometry.dispose();
      material.dispose();
      videoTexture.dispose();
    };
  }, [videoElement, scene, position]);

  useFrame(() => {
    if (
      videoTextureRef.current &&
      videoElement &&
      !videoElement.paused &&
      videoElement.readyState >= 2 // at least current frame available
    ) {
      videoTextureRef.current.needsUpdate = true;
    }
  });

  return (
    <group position={position}>
      <primitive object={scene} />
    </group>
  );
}

useGLTF.preload('/models/cinema.glb');