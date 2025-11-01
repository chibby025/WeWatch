import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';

const CinemaScene = ({ userSeats, speakingUsers, authenticatedUserID, selectedMediaItem, ws }) => {
  const mountRef = useRef(null);
  const sceneRef = useRef(null);
  const cameraRef = useRef(null);
  const rendererRef = useRef(null);
  const controlsRef = useRef(null);
  const seatsRef = useRef({});
  const avatarsRef = useRef({});
  const videoRef = useRef(null); 

  // Initialize scene on mount
  useEffect(() => {
    if (!mountRef.current) return;

    // Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x111111);
    sceneRef.current = scene;

    // Camera
    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 5, 10);
    camera.lookAt(0, 0, 0);
    cameraRef.current = camera;

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(mountRef.current.clientWidth, mountRef.current.clientHeight);
    mountRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controlsRef.current = controls;

    // Enable touch controls
    controls.enablePan = true;
    controls.enableZoom = true;
    controls.enableRotate = true;
    controls.touches = {
      ONE: THREE.TOUCH.ROTATE,
      TWO: THREE.TOUCH.DOLLY_PAN
    };

    // Lights
    const ambientLight = new THREE.AmbientLight(0x404040);
    scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
    directionalLight.position.set(5, 10, 7);
    scene.add(directionalLight);

    // Cinema Screen — with video texture
    const screenGeometry = new THREE.PlaneGeometry(16, 9);
    const video = document.createElement('video');
    video.muted = true;
    video.loop = true;
    video.playsInline = true;
    videoRef.current = video;
    const videoTexture = new THREE.VideoTexture(video);
    videoTexture.minFilter = THREE.LinearFilter;
    videoTexture.magFilter = THREE.LinearFilter;
    videoTexture.format = THREE.RGBFormat;
    const screenMaterial = new THREE.MeshBasicMaterial({ map: videoTexture, side: THREE.DoubleSide });
    const screen = new THREE.Mesh(screenGeometry, screenMaterial);
    screen.position.set(0, 3, -5);
    screen.rotation.y = Math.PI;
    scene.add(screen); // ← ONLY ONCE

    // Floor
    const floorGeometry = new THREE.PlaneGeometry(50, 50);
    const floorMaterial = new THREE.MeshStandardMaterial({ color: 0x333333 });
    const floor = new THREE.Mesh(floorGeometry, floorMaterial);
    floor.rotation.x = -Math.PI / 2;
    scene.add(floor);

    // Animation loop
    const animate = () => {
      requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    // Handle window resize
    const handleResize = () => {
      camera.aspect = mountRef.current.clientWidth / mountRef.current.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(mountRef.current.clientWidth, mountRef.current.clientHeight);
    };
    window.addEventListener('resize', handleResize);

    
  }, []);

  // Load video when selectedMediaItem changes
  useEffect(() => {
    if (!selectedMediaItem) return;
    const video = videoRef.current; // ← USE videoRef
    if (!video) return;
    video.src = `http://localhost:8080/${selectedMediaItem.file_path}`;
    video.load();
    // DO NOT call .play() here — let user click the button
  }, [selectedMediaItem]);

  // Sync playback with WebSocket
  useEffect(() => {
    if (!ws) return;
    const handlePlayback = (event) => {
      try {
        const message = JSON.parse(event.data);
        if (message.type === "playback_control") {
          const video = document.querySelector('video');
          if (!video) return;
          switch (message.command) {
            case "play":
              video.play();
              break;
            case "pause":
              video.pause();
              break;
            case "seek":
              video.currentTime = message.seek_time;
              break;
          }
        }
      } catch (err) {
        console.error("Error parsing playback message:", err);
      }
    };
    ws.addEventListener('message', handlePlayback);
    return () => ws.removeEventListener('message', handlePlayback);
  }, [ws]);

  // Render seats and avatars
  useEffect(() => {
    if (!sceneRef.current) return;
    // Clear old seats and avatars
    Object.values(seatsRef.current).forEach(seat => sceneRef.current.remove(seat));
    Object.values(avatarsRef.current).forEach(avatar => sceneRef.current.remove(avatar));
    seatsRef.current = {};
    avatarsRef.current = {};

    // Render seats
    Object.keys(userSeats).forEach(seatId => {
      const [row, col] = seatId.split('-').map(Number);
      const x = (col - 3.5) * 2;
      const z = (row - 2) * 2;

      // Seat
      const seatGeometry = new THREE.BoxGeometry(1, 0.5, 1);
      const seatMaterial = new THREE.MeshStandardMaterial({ color: 0x555555 });
      const seat = new THREE.Mesh(seatGeometry, seatMaterial);
      seat.position.set(x, 0.25, z);
      sceneRef.current.add(seat);
      seatsRef.current[seatId] = seat;

      // Avatar
      const userId = userSeats[seatId];
      const avatarGeometry = new THREE.SphereGeometry(0.3, 32, 32);
      const avatarMaterial = new THREE.MeshStandardMaterial({ 
        color: userId === authenticatedUserID ? 0x00ff00 : 0x0077ff 
      });
      const avatar = new THREE.Mesh(avatarGeometry, avatarMaterial);
      avatar.position.set(x, 1, z);
      sceneRef.current.add(avatar);
      avatarsRef.current[seatId] = avatar;

      // Speaking indicator
      if (speakingUsers.has(userId)) {
        const indicatorGeometry = new THREE.RingGeometry(0.3, 0.4, 32);
        const indicatorMaterial = new THREE.MeshBasicMaterial({ color: 0x00ff00, side: THREE.DoubleSide });
        const indicator = new THREE.Mesh(indicatorGeometry, indicatorMaterial);
        indicator.position.set(x, 1.5, z);
        indicator.rotation.x = -Math.PI / 2;
        sceneRef.current.add(indicator);
        avatarsRef.current[`${seatId}_indicator`] = indicator;
      }
    });
  }, [userSeats, speakingUsers, authenticatedUserID]);

  return (
  <div ref={mountRef} style={{ width: '100%', height: '100vh', position: 'relative' }}>
    {/* Play Button (if video is paused) */}
    {videoRef.current && videoRef.current.paused && (
      <button
        onClick={() => {
          videoRef.current.play().catch(err => {
            console.error("Play failed:", err);
            alert("Play failed. Please interact with the page and try again.");
          });
        }}
        className="absolute top-4 left-4 bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded z-10"
        style={{ zIndex: 10 }}
      >
        ▶️ Play Video
      </button>
    )}
  </div>
);
};

export default CinemaScene;