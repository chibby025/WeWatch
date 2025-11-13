import React, { useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

/**
 * EmoteAnimation - Handles avatar emote animations
 * Emotes:
 * - wave: Right arm raises and waves
 * - clap: Both arms come together and clap
 * - thumbs_up: Right arm raises with thumb up gesture
 * - laugh: Body bounces with slight rotation
 * - heart: Arms form heart shape above head
 */
export default function EmoteAnimation({
  emote,
  headRef,
  bodyRef,
  leftArmRef,
  rightArmRef,
  userColor,
}) {
  const animationPhaseRef = useRef(0);
  const animationDuration = 2000; // 2 seconds
  const startTimeRef = useRef(Date.now());

  useFrame((state, delta) => {
    const elapsed = Date.now() - startTimeRef.current;
    const progress = Math.min(elapsed / animationDuration, 1);
    
    // Animation phase (0 to 2π for smooth loop)
    animationPhaseRef.current = progress * Math.PI * 2;

    // Reset to neutral pose after animation completes
    if (progress >= 1) {
      resetToNeutral();
      return;
    }

    // Execute emote-specific animation
    switch (emote) {
      case 'wave':
        animateWave(animationPhaseRef.current);
        break;
      case 'clap':
        animateClap(animationPhaseRef.current);
        break;
      case 'thumbs_up':
        animateThumbsUp(animationPhaseRef.current);
        break;
      case 'laugh':
        animateLaugh(animationPhaseRef.current);
        break;
      case 'heart':
        animateHeart(animationPhaseRef.current);
        break;
      default:
        resetToNeutral();
    }
  });

  // WAVE: Right arm raises and rotates
  const animateWave = (phase) => {
    if (!rightArmRef.current) return;

    // Raise arm
    const raiseAmount = Math.sin(phase) * 0.5;
    rightArmRef.current.rotation.z = -0.3 - raiseAmount; // Negative = raise
    
    // Wave hand (rotate around arm)
    rightArmRef.current.rotation.x = Math.sin(phase * 4) * 0.3; // Fast wave
  };

  // CLAP: Both arms come together
  const animateClap = (phase) => {
    if (!leftArmRef.current || !rightArmRef.current) return;

    // Arms move toward center
    const clapPhase = Math.sin(phase * 2); // Fast clapping
    leftArmRef.current.rotation.z = 0.3 + clapPhase * 0.5;
    rightArmRef.current.rotation.z = -0.3 - clapPhase * 0.5;
    
    // Move arms forward
    leftArmRef.current.position.z = clapPhase * 0.2;
    rightArmRef.current.position.z = clapPhase * 0.2;
  };

  // THUMBS UP: Right arm raises, static pose
  const animateThumbsUp = (phase) => {
    if (!rightArmRef.current) return;

    // Smooth raise to thumbs up position
    const raiseProgress = Math.min(phase / Math.PI, 1); // First half of animation
    rightArmRef.current.rotation.z = -0.3 - raiseProgress * 0.8;
    rightArmRef.current.rotation.x = raiseProgress * 0.3; // Slight forward tilt
  };

  // LAUGH: Body bounces with rotation
  const animateLaugh = (phase) => {
    if (!bodyRef.current || !headRef.current) return;

    // Bounce body
    const bounce = Math.abs(Math.sin(phase * 3)) * 0.1;
    bodyRef.current.position.y = 0.3 + bounce;
    
    // Head tilts back slightly
    headRef.current.rotation.x = -Math.sin(phase) * 0.2;
    
    // Body rotates slightly
    bodyRef.current.rotation.z = Math.sin(phase * 2) * 0.1;
  };

  // HEART: Arms form heart shape above head
  const animateHeart = (phase) => {
    if (!leftArmRef.current || !rightArmRef.current) return;

    // Raise both arms above head
    const raiseProgress = Math.min(phase / Math.PI, 1);
    
    leftArmRef.current.rotation.z = 0.3 + raiseProgress * 1.2; // Raise high
    rightArmRef.current.rotation.z = -0.3 - raiseProgress * 1.2;
    
    // Arms curve inward to form heart
    leftArmRef.current.rotation.y = raiseProgress * 0.5;
    rightArmRef.current.rotation.y = -raiseProgress * 0.5;
    
    // Move arms up
    leftArmRef.current.position.y = 0.4 + raiseProgress * 0.3;
    rightArmRef.current.position.y = 0.4 + raiseProgress * 0.3;
  };

  // Reset all refs to neutral pose
  const resetToNeutral = () => {
    if (leftArmRef.current) {
      leftArmRef.current.rotation.set(0, 0, 0.3);
      leftArmRef.current.position.set(-0.35, 0.4, 0);
    }
    if (rightArmRef.current) {
      rightArmRef.current.rotation.set(0, 0, -0.3);
      rightArmRef.current.position.set(0.35, 0.4, 0);
    }
    if (bodyRef.current) {
      bodyRef.current.rotation.set(0, 0, 0);
      bodyRef.current.position.set(0, 0.3, 0);
    }
    if (headRef.current) {
      headRef.current.rotation.set(0, 0, 0);
    }
  };

  return null; // This component only manipulates refs, no visual output
}
