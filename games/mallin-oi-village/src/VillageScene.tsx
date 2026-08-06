import { Suspense, useEffect, useMemo, useRef } from "react";
import { Canvas, ThreeEvent, useFrame, useThree } from "@react-three/fiber";
import {
  Billboard,
  Edges,
  Float,
  Html,
  Sparkles,
  useTexture,
} from "@react-three/drei";
import * as THREE from "three";
import {
  facilities,
  Facility,
  FacilityId,
  sleepingResidents,
  trees,
  villagers,
} from "./data";
import { moveWithWorldCollisions } from "./world-collision";

export type MovementInput = { x: number; y: number };

type VillageSceneProps = {
  inputRef: React.MutableRefObject<MovementInput>;
  playerSkin: string;
  playerEffectSrc?: string | null;
  playerName: string;
  onNearestChange: (facility: FacilityId | null) => void;
  onSelect: (facility: FacilityId) => void;
  onResidentHello: (name: string) => void;
};

const textureSettings = (texture: THREE.Texture) => {
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
};

function CartoonMaterial({ color }: { color: string }) {
  return <meshToonMaterial color={color} />;
}

function CartoonEdges({ color = "#53623f" }: { color?: string }) {
  return <Edges threshold={22} color={color} scale={1.012} />;
}

function SoftShadow({
  scale = 1,
  meshRef,
}: {
  scale?: number;
  meshRef?: React.RefObject<THREE.Mesh | null>;
}) {
  return (
    <mesh
      ref={meshRef}
      position={[0, 0.29, 0]}
      rotation={[-Math.PI / 2, 0, 0]}
      scale={[1, 0.62, 1]}
      renderOrder={2}
    >
      <circleGeometry args={[0.72 * scale, 24]} />
      <meshBasicMaterial
        color="#24452c"
        transparent
        opacity={0.34}
        depthWrite={false}
        polygonOffset
        polygonOffsetFactor={-2}
      />
    </mesh>
  );
}

function CharacterEffectPlane({
  src,
  scale,
  movementRef,
}: {
  src: string;
  scale: number;
  movementRef?: React.MutableRefObject<MovementInput>;
}) {
  const loaded = useTexture(src);
  const texture = useMemo(() => textureSettings(loaded), [loaded]);
  const effectRef = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    if (!effectRef.current) return;
    const movement = movementRef?.current;
    const running = Math.min(1, Math.hypot(movement?.x ?? 0, movement?.y ?? 0));
    const pulse = 1 + Math.sin(state.clock.elapsedTime * (2.2 + running * 2.5)) * 0.045;
    effectRef.current.rotation.z = Math.sin(state.clock.elapsedTime * 0.7) * 0.055;
    effectRef.current.scale.setScalar(pulse);
  });

  return (
    <mesh ref={effectRef} position={[0, 0, -0.025]} renderOrder={3}>
      <planeGeometry args={[scale * 1.22, scale * 1.22]} />
      <meshBasicMaterial
        map={texture}
        transparent
        alphaTest={0.02}
        depthWrite={false}
        side={THREE.DoubleSide}
        toneMapped={false}
      />
    </mesh>
  );
}

function AvatarSprite({
  src,
  scale = 2.5,
  label,
  message,
  online,
  onClick,
  effectSrc,
  movementRef,
}: {
  src: string;
  scale?: number;
  label?: string;
  message?: string;
  online?: boolean;
  onClick?: () => void;
  effectSrc?: string | null;
  movementRef?: React.MutableRefObject<MovementInput>;
}) {
  const loaded = useTexture(src);
  const texture = useMemo(() => textureSettings(loaded), [loaded]);
  const visualRef = useRef<THREE.Group>(null);
  const shadowRef = useRef<THREE.Mesh>(null);
  const phaseRef = useRef(0);
  const blendRef = useRef(0);
  const facingRef = useRef(1);

  useFrame((state, delta) => {
    if (!visualRef.current) return;
    const movement = movementRef?.current;
    const moveX = movement?.x ?? 0;
    const magnitude = Math.min(1, Math.hypot(moveX, movement?.y ?? 0));
    const targetBlend = magnitude > 0.06 ? magnitude : 0;
    blendRef.current = THREE.MathUtils.lerp(
      blendRef.current,
      targetBlend,
      1 - Math.exp(-delta * 12),
    );
    const runBlend = blendRef.current;

    if (Math.abs(moveX) > 0.08) facingRef.current = moveX < 0 ? -1 : 1;
    phaseRef.current += delta * (2.2 + runBlend * 12.5);

    const stride = Math.sin(phaseRef.current);
    const footfall = Math.abs(stride);
    const idleLift = Math.sin(state.clock.elapsedTime * 2.1) * 0.025 * (1 - runBlend);
    const runLift = footfall * 0.13 * runBlend;
    const squash = Math.abs(Math.cos(phaseRef.current)) * runBlend;

    visualRef.current.position.y = idleLift + runLift;
    visualRef.current.rotation.z =
      -moveX * 0.085 * runBlend + stride * 0.026 * runBlend;
    visualRef.current.scale.set(
      facingRef.current * (1 + squash * 0.035),
      1 - squash * 0.055,
      1,
    );

    if (shadowRef.current) {
      const shadowPulse = 1 - runLift * 0.55;
      shadowRef.current.scale.set(shadowPulse, 0.62 * shadowPulse, 1);
      const material = shadowRef.current.material as THREE.MeshBasicMaterial;
      material.opacity = 0.34 - runLift * 0.28;
    }
  });

  const handleClick = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation();
    onClick?.();
  };

  return (
    <group onClick={handleClick}>
      <SoftShadow scale={scale / 2.2} meshRef={shadowRef} />
      <Billboard follow position={[0, scale * 0.62, 0]}>
        <group ref={visualRef}>
          {effectSrc && (
            <Suspense fallback={null}>
              <CharacterEffectPlane
                src={effectSrc}
                scale={scale}
                movementRef={movementRef}
              />
            </Suspense>
          )}
          <mesh position={[0, 0, 0.02]} renderOrder={4}>
            <planeGeometry args={[scale * 0.7, scale]} />
            <meshBasicMaterial
              map={texture}
              transparent
              alphaTest={0.06}
              side={THREE.DoubleSide}
              toneMapped={false}
            />
          </mesh>
        </group>
      </Billboard>
      {label && (
        <Html center position={[0, scale + 0.55, 0]} distanceFactor={10} zIndexRange={[20, 0]}>
          <div className="world-name" onPointerDown={(event) => event.stopPropagation()}>
            {online && <span className="online-dot" />}
            {label}
          </div>
        </Html>
      )}
      {message && (
        <Html center position={[0.7, scale + 1.35, 0]} distanceFactor={11} zIndexRange={[19, 0]}>
          <div className="talk-bubble">{message}</div>
        </Html>
      )}
    </group>
  );
}

function PlayerController({
  inputRef,
  skin,
  effectSrc,
  playerName,
  onNearestChange,
}: {
  inputRef: React.MutableRefObject<MovementInput>;
  skin: string;
  effectSrc?: string | null;
  playerName: string;
  onNearestChange: (facility: FacilityId | null) => void;
}) {
  const player = useRef<THREE.Group>(null);
  const nearestRef = useRef<FacilityId | null>(null);
  const { camera } = useThree();

  useEffect(() => {
    camera.position.set(12, 20, 24);
    camera.lookAt(0, 0, 0);
  }, [camera]);

  useFrame((_state, delta) => {
    if (!player.current) return;
    const input = inputRef.current;
    const magnitude = Math.min(1, Math.hypot(input.x, input.y));
    if (magnitude > 0.03) {
      const speed = 6.3 * delta;
      const next = moveWithWorldCollisions(
        { x: player.current.position.x, z: player.current.position.z },
        input.x * speed,
        input.y * speed,
      );
      player.current.position.x = next.x;
      player.current.position.z = next.z;
    }

    const playerPosition = player.current.position;
    const desiredCamera = new THREE.Vector3(
      playerPosition.x + 12,
      20,
      playerPosition.z + 24,
    );
    camera.position.lerp(desiredCamera, 1 - Math.pow(0.001, delta));
    camera.lookAt(playerPosition.x, 0.8, playerPosition.z);

    let closest: Facility | null = null;
    let closestDistance = 4.25;
    facilities.forEach((facility) => {
      const distance = Math.hypot(
        playerPosition.x - facility.position[0],
        playerPosition.z - facility.position[2],
      );
      if (distance < closestDistance) {
        closest = facility;
        closestDistance = distance;
      }
    });
    const nextNearest = closest ? (closest as Facility).id : null;
    if (nearestRef.current !== nextNearest) {
      nearestRef.current = nextNearest;
      onNearestChange(nextNearest);
    }
  });

  return (
    <group ref={player} position={[0, 0, 7]}>
      <Suspense fallback={null}>
        <AvatarSprite
          src={skin}
          scale={2.85}
          label={playerName}
          online
          effectSrc={effectSrc}
          movementRef={inputRef}
        />
      </Suspense>
    </group>
  );
}

function Path({ position, size, rotation = 0 }: { position: [number, number, number]; size: [number, number]; rotation?: number }) {
  return (
    <mesh position={position} rotation={[-Math.PI / 2, 0, rotation]} receiveShadow>
      <planeGeometry args={size} />
      <CartoonMaterial color="#ead7a7" />
    </mesh>
  );
}

function Tree({ position, scale = 1, tint = "#5e9a48" }: { position: [number, number, number]; scale?: number; tint?: string }) {
  return (
    <group position={position} scale={scale}>
      <mesh position={[0, 1.15, 0]} castShadow>
        <cylinderGeometry args={[0.28, 0.42, 2.3, 8]} />
        <CartoonMaterial color="#7b5437" />
        <CartoonEdges color="#583827" />
      </mesh>
      <mesh position={[0, 2.75, 0]} castShadow>
        <dodecahedronGeometry args={[1.35, 0]} />
        <CartoonMaterial color={tint} />
        <CartoonEdges color="#3d6e35" />
      </mesh>
      <mesh position={[-0.8, 2.45, 0.05]} castShadow>
        <dodecahedronGeometry args={[0.82, 0]} />
        <CartoonMaterial color="#77b05a" />
        <CartoonEdges color="#4d7e3e" />
      </mesh>
      <mesh position={[0.75, 2.5, -0.05]} castShadow>
        <dodecahedronGeometry args={[0.78, 0]} />
        <CartoonMaterial color="#4f8741" />
        <CartoonEdges color="#356532" />
      </mesh>
    </group>
  );
}

function FlowerPatch({ position, color }: { position: [number, number, number]; color: string }) {
  const flowers = [
    [-0.5, 0, -0.25],
    [0, 0, 0.2],
    [0.5, 0, -0.12],
    [0.25, 0, 0.55],
  ];
  return (
    <group position={position}>
      {flowers.map((point, index) => (
        <group key={index} position={point as [number, number, number]}>
          <mesh position={[0, 0.18, 0]}>
            <cylinderGeometry args={[0.025, 0.025, 0.36, 5]} />
            <CartoonMaterial color="#4d843e" />
          </mesh>
          <mesh position={[0, 0.4, 0]}>
            <sphereGeometry args={[0.14, 6, 5]} />
            <CartoonMaterial color={color} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function Building({ facility, onSelect }: { facility: Facility; onSelect: (id: FacilityId) => void }) {
  const tall = facility.id === "town-hall";
  const width = tall ? 5.2 : 4.2;
  const height = tall ? 3.7 : 3.05;
  const handleClick = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation();
    onSelect(facility.id);
  };

  return (
    <group position={facility.position} onClick={handleClick}>
      <mesh position={[0, height / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[width, height, 3.7]} />
        <CartoonMaterial color={facility.color} />
        <CartoonEdges />
      </mesh>
      <mesh position={[0, height + 0.9, 0]} rotation={[0, Math.PI / 4, 0]} castShadow>
        <coneGeometry args={[tall ? 4.5 : 3.7, 2.25, 4]} />
        <CartoonMaterial color={facility.roof} />
        <CartoonEdges color="#68483d" />
      </mesh>
      <mesh position={[0, 1.3, 1.88]}>
        <boxGeometry args={[1.15, 2.05, 0.16]} />
        <CartoonMaterial color="#70483b" />
        <CartoonEdges color="#4e3028" />
      </mesh>
      <mesh position={[-1.45, 2.08, 1.9]}>
        <boxGeometry args={[0.95, 0.9, 0.12]} />
        <CartoonMaterial color="#bfe5ef" />
        <CartoonEdges color="#6e9daa" />
      </mesh>
      <mesh position={[1.45, 2.08, 1.9]}>
        <boxGeometry args={[0.95, 0.9, 0.12]} />
        <CartoonMaterial color="#bfe5ef" />
        <CartoonEdges color="#6e9daa" />
      </mesh>
      <mesh position={[0, 3.25, 1.98]}>
        <boxGeometry args={[2.75, 0.8, 0.18]} />
        <CartoonMaterial color="#fff7dc" />
        <CartoonEdges color="#806c53" />
      </mesh>
      <Html center position={[0, 3.25, 2.14]} distanceFactor={11} zIndexRange={[16, 0]}>
        <button type="button" className="building-sign" onClick={() => onSelect(facility.id)}>
          <span>{facility.icon}</span>{facility.shortName}
        </button>
      </Html>
      <mesh position={[0, 0.12, 2.5]} receiveShadow>
        <boxGeometry args={[2.2, 0.22, 1.2]} />
        <CartoonMaterial color="#d4bd8a" />
        <CartoonEdges color="#8b7656" />
      </mesh>
    </group>
  );
}

function SleepingHouse({
  resident,
  onClick,
}: {
  resident: (typeof sleepingResidents)[number];
  onClick: () => void;
}) {
  const loaded = useTexture(resident.src);
  const texture = useMemo(() => textureSettings(loaded), [loaded]);
  return (
    <group position={resident.position} onClick={(event) => { event.stopPropagation(); onClick(); }}>
      <mesh position={[0, 1.3, 0]} castShadow>
        <boxGeometry args={[3.3, 2.6, 3]} />
        <CartoonMaterial color={resident.houseColor} />
        <CartoonEdges />
      </mesh>
      <mesh position={[0, 3.05, 0]} rotation={[0, Math.PI / 4, 0]} castShadow>
        <coneGeometry args={[3.05, 1.85, 4]} />
        <CartoonMaterial color={resident.roofColor} />
        <CartoonEdges color="#68483d" />
      </mesh>
      <mesh position={[-0.75, 1.1, 1.54]}>
        <boxGeometry args={[0.8, 1.65, 0.12]} />
        <CartoonMaterial color="#745342" />
        <CartoonEdges color="#4d3429" />
      </mesh>
      <mesh position={[0.85, 1.55, 1.56]}>
        <boxGeometry args={[1.05, 0.82, 0.12]} />
        <CartoonMaterial color="#c9ecf2" />
        <CartoonEdges color="#719aa4" />
      </mesh>
      <mesh position={[0.85, 1.55, 1.63]}>
        <planeGeometry args={[0.72, 0.72]} />
        <meshBasicMaterial map={texture} transparent alphaTest={0.08} toneMapped={false} />
      </mesh>
      <Html center position={[1.25, 2.45, 1.85]} distanceFactor={11} zIndexRange={[14, 0]}>
        <div className="sleep-bubble"><b>Zzz</b><span>{resident.name}</span></div>
      </Html>
    </group>
  );
}

function Fountain() {
  return (
    <group position={[0, 0.22, 0]}>
      <mesh receiveShadow>
        <cylinderGeometry args={[2.25, 2.45, 0.42, 32]} />
        <CartoonMaterial color="#d8c8a8" />
        <CartoonEdges color="#8e8069" />
      </mesh>
      <mesh position={[0, 0.25, 0]}>
        <cylinderGeometry args={[1.78, 1.9, 0.22, 32]} />
        <CartoonMaterial color="#79cfe1" />
        <CartoonEdges color="#559baa" />
      </mesh>
      <mesh position={[0, 1.08, 0]} castShadow>
        <cylinderGeometry args={[0.25, 0.42, 1.65, 12]} />
        <CartoonMaterial color="#c6b698" />
        <CartoonEdges color="#857860" />
      </mesh>
      <mesh position={[0, 1.83, 0]}>
        <sphereGeometry args={[0.36, 12, 10]} />
        <CartoonMaterial color="#d8c8a8" />
        <CartoonEdges color="#8e8069" />
      </mesh>
      <Sparkles count={14} scale={[2.5, 2.1, 2.5]} color="#d5fbff" speed={0.4} size={1.7} />
    </group>
  );
}

function Bridge() {
  return (
    <group position={[-5.2, 0.35, 1.8]}>
      <mesh receiveShadow castShadow>
        <boxGeometry args={[5.2, 0.35, 2.4]} />
        <CartoonMaterial color="#c88c58" />
        <CartoonEdges color="#815536" />
      </mesh>
      {[-2.2, -1.1, 0, 1.1, 2.2].map((x) => (
        <mesh key={x} position={[x, 0.23, 0]}>
          <boxGeometry args={[0.09, 0.08, 2.44]} />
          <CartoonMaterial color="#805c43" />
        </mesh>
      ))}
      {[-1.05, 1.05].map((z) => (
        <group key={z} position={[0, 0, z]}>
          <mesh position={[0, 0.75, 0]}>
            <boxGeometry args={[5.2, 0.12, 0.12]} />
            <CartoonMaterial color="#7a593d" />
            <CartoonEdges color="#523a28" />
          </mesh>
          {[-2.25, 0, 2.25].map((x) => (
            <mesh key={x} position={[x, 0.42, 0]}>
              <boxGeometry args={[0.14, 0.9, 0.14]} />
              <CartoonMaterial color="#7a593d" />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  );
}

function World({ onSelect, onResidentHello }: { onSelect: (id: FacilityId) => void; onResidentHello: (name: string) => void }) {
  return (
    <>
      <fog attach="fog" args={["#c8ebc1", 30, 54]} />
      <mesh position={[0, -0.52, 0]} receiveShadow>
        <cylinderGeometry args={[25.5, 26.2, 1.2, 64]} />
        <CartoonMaterial color="#d8c18e" />
        <CartoonEdges color="#967b50" />
      </mesh>
      <mesh position={[0, -0.08, 0]} receiveShadow>
        <cylinderGeometry args={[23.8, 24.4, 0.5, 64]} />
        <CartoonMaterial color="#79b95a" />
        <CartoonEdges color="#4d7d3b" />
      </mesh>
      <mesh position={[-5.2, 0.2, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[4.5, 45]} />
        <CartoonMaterial color="#72c8d8" />
      </mesh>
      <Path position={[0, 0.22, -3.8]} size={[3.2, 9]} />
      <Path position={[-5.4, 0.225, -3]} size={[9, 2.5]} rotation={Math.PI / 2} />
      <Path position={[-5.8, 0.225, 6]} size={[12, 2.5]} rotation={Math.PI / 2} />
      <Path position={[5.6, 0.225, -3]} size={[8, 2.5]} rotation={Math.PI / 2} />
      <Path position={[6.2, 0.225, 6]} size={[9.5, 2.5]} rotation={Math.PI / 2} />
      <Path position={[10.8, 0.225, 9.5]} size={[10, 2.2]} rotation={0.7} />
      <mesh position={[0, 0.23, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[5.2, 40]} />
        <CartoonMaterial color="#e8d19c" />
      </mesh>
      <Bridge />
      <Fountain />
      {facilities.map((facility) => (
        <Building key={facility.id} facility={facility} onSelect={onSelect} />
      ))}
      {sleepingResidents.map((resident) => (
        <Suspense key={resident.name} fallback={null}>
          <SleepingHouse
            resident={resident}
            onClick={() => onResidentHello(`${resident.name}님은 집에서 쉬는 중이에요`)}
          />
        </Suspense>
      ))}
      {villagers.map((villager) => (
        <Suspense key={villager.name} fallback={null}>
          <Float speed={1.4} rotationIntensity={0} floatIntensity={0.12}>
            <group position={villager.position}>
              <AvatarSprite
                src={villager.src}
                scale={2.45}
                label={villager.name}
                message={villager.message}
                online
                onClick={() => onResidentHello(`${villager.name}님에게 인사했어요!`)}
              />
            </group>
          </Float>
        </Suspense>
      ))}
      {trees.map((tree, index) => (
        <Tree
          key={index}
          position={tree.position}
          scale={tree.scale}
          tint={tree.tint}
        />
      ))}
      <FlowerPatch position={[-2.8, 0.18, 4.4]} color="#fff5a6" />
      <FlowerPatch position={[4.2, 0.18, -4.3]} color="#f8a6b9" />
      <FlowerPatch position={[7.4, 0.18, 9]} color="#fff2f0" />
      <FlowerPatch position={[-12, 0.18, 10]} color="#cdb5ff" />
    </>
  );
}

export default function VillageScene({
  inputRef,
  playerSkin,
  playerEffectSrc,
  playerName,
  onNearestChange,
  onSelect,
  onResidentHello,
}: VillageSceneProps) {
  return (
    <Canvas
      className="village-canvas"
      shadows
      dpr={[1, 1.45]}
      camera={{ position: [12, 20, 24], fov: 46, near: 0.1, far: 100 }}
      gl={{ antialias: true, powerPreference: "high-performance", alpha: false }}
    >
      <color attach="background" args={["#bfe3b4"]} />
      <ambientLight intensity={1.35} />
      <hemisphereLight args={["#e8f7ff", "#6f914c", 1.25]} />
      <directionalLight
        position={[-10, 22, 12]}
        intensity={2.1}
        color="#fff3d3"
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-camera-left={-28}
        shadow-camera-right={28}
        shadow-camera-top={28}
        shadow-camera-bottom={-28}
      />
      <World onSelect={onSelect} onResidentHello={onResidentHello} />
      <PlayerController
        inputRef={inputRef}
        skin={playerSkin}
        effectSrc={playerEffectSrc}
        playerName={playerName}
        onNearestChange={onNearestChange}
      />
    </Canvas>
  );
}
