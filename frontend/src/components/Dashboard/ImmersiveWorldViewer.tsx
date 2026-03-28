'use client'

import { useMemo } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls, Sphere, useTexture } from '@react-three/drei'
import * as THREE from 'three'

function Starfield() {
  const positions = useMemo(() => {
    const values = new Float32Array(1400 * 3)
    for (let i = 0; i < 1400; i += 1) {
      const theta = Math.random() * Math.PI * 2
      const phi = Math.acos(2 * Math.random() - 1)
      const radius = 28
      values[i * 3] = radius * Math.sin(phi) * Math.cos(theta)
      values[i * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta)
      values[i * 3 + 2] = radius * Math.cos(phi)
    }
    return values
  }, [])

  return (
    <points>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial color="#dbeafe" size={0.06} sizeAttenuation transparent opacity={0.9} />
    </points>
  )
}

function PanoramaScene({ panoUrl }: { panoUrl: string }) {
  const texture = useTexture(panoUrl)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.minFilter = THREE.LinearFilter
  texture.magFilter = THREE.LinearFilter

  return (
    <>
      <color attach="background" args={['#020617']} />
      <ambientLight intensity={1.15} />
      <Starfield />
      <Sphere args={[14, 64, 64]} scale={[-1, 1, 1]}>
        <meshBasicMaterial map={texture} side={THREE.BackSide} toneMapped={false} />
      </Sphere>
      <OrbitControls
        enablePan={false}
        enableZoom
        enableDamping
        dampingFactor={0.06}
        rotateSpeed={-0.32}
        zoomSpeed={0.5}
        minDistance={0.1}
        maxDistance={7}
      />
    </>
  )
}

export function ImmersiveWorldViewer({ panoUrl }: { panoUrl: string }) {
  return (
    <div className="h-full w-full overflow-hidden rounded-[1.75rem] border border-white/12 bg-slate-950/70 shadow-[0_24px_90px_rgba(2,6,23,0.55)]">
      <Canvas camera={{ position: [0, 0, 0.1], fov: 72 }} dpr={[1, 1.5]}>
        <PanoramaScene panoUrl={panoUrl} />
      </Canvas>
    </div>
  )
}
