/* =====================================================
   DEEPAK PANDEY - 3D PORTFOLIO (Enhanced)
   Three.js + GSAP + Custom Interactions
   Features: Globe, Wave Terrain, Particle Connections,
   Mouse-Interactive Particles, Floating Geometries
   ===================================================== */

// ===== GLOBAL VARIABLES =====
let scene, camera, renderer;
let particles, particlePositions, particleData;
let connectionLines, connectionPositions, connectionColors;
let geometries = [];
let mouseX = 0, mouseY = 0;
let targetMouseX = 0, targetMouseY = 0;
const clock = new THREE.Clock();
const PARTICLE_COUNT = 1500;
const MAX_CONNECTIONS = 100;
const CONNECTION_DISTANCE = 8;

// Globe variables
let globeScene, globeCamera, globeRenderer, globeMesh, globeNodes, globeLines;

// ===== LOADER =====
window.addEventListener('load', () => {
  setTimeout(() => {
    document.getElementById('loader').classList.add('hidden');
  }, 2200);
});

// ======================================================
// ===== MAIN THREE.JS BACKGROUND SCENE ================
// ======================================================
function initThreeJS() {
  const canvas = document.getElementById('bg-canvas');

  scene = new THREE.Scene();

  camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
  camera.position.z = 30;

  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  // Particles with connection data
  createParticlesWithConnections();

  // More floating geometries (larger, more dramatic)
  createFloatingGeometries();

  // Lights
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
  scene.add(ambientLight);

  const pointLight1 = new THREE.PointLight(0x00d4ff, 3, 120);
  pointLight1.position.set(25, 25, 25);
  scene.add(pointLight1);

  const pointLight2 = new THREE.PointLight(0x7c3aed, 3, 120);
  pointLight2.position.set(-25, -25, 25);
  scene.add(pointLight2);

  const pointLight3 = new THREE.PointLight(0xf97316, 1.5, 80);
  pointLight3.position.set(0, 30, -10);
  scene.add(pointLight3);

  animate();
}

// ===== PARTICLES WITH CONNECTION LINES =====
function createParticlesWithConnections() {
  // Particle positions & velocities
  particlePositions = new Float32Array(PARTICLE_COUNT * 3);
  const colors = new Float32Array(PARTICLE_COUNT * 3);
  particleData = [];

  for (let i = 0; i < PARTICLE_COUNT; i++) {
    const i3 = i * 3;
    particlePositions[i3] = (Math.random() - 0.5) * 80;
    particlePositions[i3 + 1] = (Math.random() - 0.5) * 80;
    particlePositions[i3 + 2] = (Math.random() - 0.5) * 60;

    const mix = Math.random();
    colors[i3] = mix < 0.5 ? 0 : 0.486;
    colors[i3 + 1] = mix < 0.5 ? 0.831 : 0.227;
    colors[i3 + 2] = mix < 0.5 ? 1 : 0.929;

    particleData.push({
      velocity: new THREE.Vector3(
        (Math.random() - 0.5) * 0.02,
        (Math.random() - 0.5) * 0.02,
        (Math.random() - 0.5) * 0.01
      ),
    });
  }

  const particleGeometry = new THREE.BufferGeometry();
  particleGeometry.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3));
  particleGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  particleGeometry.setDrawRange(0, PARTICLE_COUNT);

  const particleMaterial = new THREE.PointsMaterial({
    size: 0.2,
    vertexColors: true,
    transparent: true,
    opacity: 0.8,
    blending: THREE.AdditiveBlending,
    sizeAttenuation: true,
  });

  particles = new THREE.Points(particleGeometry, particleMaterial);
  scene.add(particles);

  // Connection lines between nearby particles
  const lineGeometry = new THREE.BufferGeometry();
  connectionPositions = new Float32Array(MAX_CONNECTIONS * 2 * 3); // 2 vertices per line
  connectionColors = new Float32Array(MAX_CONNECTIONS * 2 * 3);
  lineGeometry.setAttribute('position', new THREE.BufferAttribute(connectionPositions, 3));
  lineGeometry.setAttribute('color', new THREE.BufferAttribute(connectionColors, 3));
  lineGeometry.setDrawRange(0, 0);

  const lineMaterial = new THREE.LineBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.4,
    blending: THREE.AdditiveBlending,
  });

  connectionLines = new THREE.LineSegments(lineGeometry, lineMaterial);
  scene.add(connectionLines);
}

// ===== FLOATING GEOMETRIES (MORE & BIGGER) =====
function createFloatingGeometries() {
  const geoConfigs = [
    { geo: new THREE.IcosahedronGeometry(1.5, 1), color: 0x00d4ff, size: 1.5 },
    { geo: new THREE.OctahedronGeometry(1.2, 0), color: 0x7c3aed, size: 1.2 },
    { geo: new THREE.TetrahedronGeometry(1.0, 0), color: 0x00d4ff, size: 1.0 },
    { geo: new THREE.TorusGeometry(1.0, 0.35, 8, 20), color: 0x7c3aed, size: 1.0 },
    { geo: new THREE.DodecahedronGeometry(1.0, 0), color: 0x00d4ff, size: 1.0 },
    { geo: new THREE.TorusKnotGeometry(0.8, 0.3, 48, 12), color: 0x7c3aed, size: 0.8 },
    { geo: new THREE.IcosahedronGeometry(2.0, 0), color: 0xf97316, size: 2.0 },
    { geo: new THREE.OctahedronGeometry(1.5, 1), color: 0x00d4ff, size: 1.5 },
    { geo: new THREE.TorusGeometry(1.3, 0.4, 6, 16), color: 0x7c3aed, size: 1.3 },
    { geo: new THREE.TetrahedronGeometry(1.4, 1), color: 0xf97316, size: 1.4 },
    { geo: new THREE.BoxGeometry(1.2, 1.2, 1.2), color: 0x00d4ff, size: 1.2 },
    { geo: new THREE.ConeGeometry(0.8, 1.6, 6), color: 0x7c3aed, size: 1.0 },
  ];

  geoConfigs.forEach((config) => {
    const material = new THREE.MeshPhongMaterial({
      color: config.color,
      wireframe: true,
      transparent: true,
      opacity: 0.25,
      shininess: 100,
    });

    const mesh = new THREE.Mesh(config.geo, material);

    mesh.position.set(
      (Math.random() - 0.5) * 60,
      (Math.random() - 0.5) * 50,
      (Math.random() - 0.5) * 30 - 5
    );

    mesh.rotation.set(
      Math.random() * Math.PI,
      Math.random() * Math.PI,
      Math.random() * Math.PI
    );

    mesh.userData = {
      rotationSpeed: {
        x: (Math.random() - 0.5) * 0.015,
        y: (Math.random() - 0.5) * 0.015,
        z: (Math.random() - 0.5) * 0.008,
      },
      floatSpeed: Math.random() * 0.5 + 0.2,
      floatAmplitude: Math.random() * 1.0 + 0.5,
      initialY: mesh.position.y,
      initialX: mesh.position.x,
      xDrift: Math.random() * 0.3 + 0.1,
    };

    geometries.push(mesh);
    scene.add(mesh);
  });
}

// ===== MAIN ANIMATION LOOP =====
function animate() {
  requestAnimationFrame(animate);

  const elapsed = clock.getElapsedTime();

  // Smooth mouse follow
  targetMouseX += (mouseX - targetMouseX) * 0.05;
  targetMouseY += (mouseY - targetMouseY) * 0.05;

  // Animate particles (subtle drift)
  const positions = particles.geometry.attributes.position.array;
  for (let i = 0; i < PARTICLE_COUNT; i++) {
    const i3 = i * 3;
    const data = particleData[i];

    positions[i3] += data.velocity.x;
    positions[i3 + 1] += data.velocity.y;
    positions[i3 + 2] += data.velocity.z;

    // Wrap around boundaries
    if (positions[i3] > 40) positions[i3] = -40;
    if (positions[i3] < -40) positions[i3] = 40;
    if (positions[i3 + 1] > 40) positions[i3 + 1] = -40;
    if (positions[i3 + 1] < -40) positions[i3 + 1] = 40;
    if (positions[i3 + 2] > 30) positions[i3 + 2] = -30;
    if (positions[i3 + 2] < -30) positions[i3 + 2] = 30;
  }
  particles.geometry.attributes.position.needsUpdate = true;

  // Update connection lines between nearby particles
  let connectionCount = 0;
  for (let i = 0; i < PARTICLE_COUNT && connectionCount < MAX_CONNECTIONS; i++) {
    for (let j = i + 1; j < PARTICLE_COUNT && connectionCount < MAX_CONNECTIONS; j++) {
      const i3 = i * 3;
      const j3 = j * 3;
      const dx = positions[i3] - positions[j3];
      const dy = positions[i3 + 1] - positions[j3 + 1];
      const dz = positions[i3 + 2] - positions[j3 + 2];
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

      if (dist < CONNECTION_DISTANCE) {
        const ci = connectionCount * 6;
        const alpha = 1 - dist / CONNECTION_DISTANCE;

        connectionPositions[ci] = positions[i3];
        connectionPositions[ci + 1] = positions[i3 + 1];
        connectionPositions[ci + 2] = positions[i3 + 2];
        connectionPositions[ci + 3] = positions[j3];
        connectionPositions[ci + 4] = positions[j3 + 1];
        connectionPositions[ci + 5] = positions[j3 + 2];

        connectionColors[ci] = 0;
        connectionColors[ci + 1] = 0.83 * alpha;
        connectionColors[ci + 2] = 1 * alpha;
        connectionColors[ci + 3] = 0;
        connectionColors[ci + 4] = 0.83 * alpha;
        connectionColors[ci + 5] = 1 * alpha;

        connectionCount++;
      }
    }
  }
  connectionLines.geometry.setDrawRange(0, connectionCount * 2);
  connectionLines.geometry.attributes.position.needsUpdate = true;
  connectionLines.geometry.attributes.color.needsUpdate = true;

  // Rotate particle system slowly
  particles.rotation.x = elapsed * 0.02 + targetMouseY * 0.08;
  particles.rotation.y = elapsed * 0.03 + targetMouseX * 0.08;
  connectionLines.rotation.copy(particles.rotation);

  // Animate floating geometries (float + drift)
  geometries.forEach((mesh) => {
    const ud = mesh.userData;
    mesh.rotation.x += ud.rotationSpeed.x;
    mesh.rotation.y += ud.rotationSpeed.y;
    mesh.rotation.z += ud.rotationSpeed.z;

    mesh.position.y = ud.initialY + Math.sin(elapsed * ud.floatSpeed) * ud.floatAmplitude;
    mesh.position.x = ud.initialX + Math.sin(elapsed * ud.xDrift) * 0.5;
  });

  // Camera subtle movement
  camera.position.x += (targetMouseX * 3 - camera.position.x) * 0.02;
  camera.position.y += (targetMouseY * 3 - camera.position.y) * 0.02;
  camera.lookAt(0, 0, 0);

  renderer.render(scene, camera);
}


// ======================================================
// ===== HERO 3D GLOBE (NETWORK WIREFRAME) ==============
// ======================================================
function initHeroGlobe() {
  const canvas = document.getElementById('hero-globe-canvas');
  if (!canvas) return;

  // Get actual dimensions - fallback to parent if canvas hasn't laid out yet
  let width = canvas.clientWidth;
  let height = canvas.clientHeight;

  if (width === 0 || height === 0) {
    const parentRect = canvas.parentElement.getBoundingClientRect();
    width = Math.round(parentRect.width * 0.55) || 600;
    height = parentRect.height || window.innerHeight;
  }

  // If still no dimensions, retry on next frame
  if (width === 0 || height === 0) {
    requestAnimationFrame(initHeroGlobe);
    return;
  }

  globeScene = new THREE.Scene();

  globeCamera = new THREE.PerspectiveCamera(55, width / height, 0.1, 100);
  globeCamera.position.set(0, 0.2, 6.5);

  globeRenderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  globeRenderer.setSize(width, height);
  globeRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  globeRenderer.setClearColor(0x000000, 0);

  // Create wireframe globe
  const globeGeo = new THREE.IcosahedronGeometry(2, 3);
  const globeMat = new THREE.MeshPhongMaterial({
    color: 0x00d4ff,
    wireframe: true,
    transparent: true,
    opacity: 0.15,
  });
  globeMesh = new THREE.Mesh(globeGeo, globeMat);
  globeScene.add(globeMesh);

  // Inner glow sphere
  const innerGeo = new THREE.IcosahedronGeometry(1.95, 2);
  const innerMat = new THREE.MeshPhongMaterial({
    color: 0x7c3aed,
    wireframe: true,
    transparent: true,
    opacity: 0.08,
  });
  const innerMesh = new THREE.Mesh(innerGeo, innerMat);
  globeMesh.add(innerMesh);

  // Add glowing nodes on globe surface
  const nodeGeo = new THREE.SphereGeometry(0.04, 8, 8);
  const nodeMat = new THREE.MeshBasicMaterial({ color: 0x00d4ff });
  globeNodes = [];

  const vertices = globeGeo.attributes.position.array;
  const nodeCount = 60;
  const usedIndices = new Set();

  for (let n = 0; n < nodeCount; n++) {
    let idx;
    do { idx = Math.floor(Math.random() * (vertices.length / 3)); } while (usedIndices.has(idx));
    usedIndices.add(idx);

    const node = new THREE.Mesh(nodeGeo, nodeMat.clone());
    node.position.set(vertices[idx * 3], vertices[idx * 3 + 1], vertices[idx * 3 + 2]);
    node.userData.pulseSpeed = Math.random() * 2 + 1;
    node.userData.pulseOffset = Math.random() * Math.PI * 2;
    globeMesh.add(node);
    globeNodes.push(node);
  }

  // Connect some nodes with glowing lines
  const linePositions = [];
  const connectedNodes = [];
  for (let i = 0; i < globeNodes.length; i++) {
    for (let j = i + 1; j < globeNodes.length; j++) {
      const dist = globeNodes[i].position.distanceTo(globeNodes[j].position);
      if (dist < 1.2 && connectedNodes.length < 80) {
        linePositions.push(
          globeNodes[i].position.x, globeNodes[i].position.y, globeNodes[i].position.z,
          globeNodes[j].position.x, globeNodes[j].position.y, globeNodes[j].position.z
        );
        connectedNodes.push({ i, j });
      }
    }
  }

  if (linePositions.length > 0) {
    const lineGeo = new THREE.BufferGeometry();
    lineGeo.setAttribute('position', new THREE.Float32BufferAttribute(linePositions, 3));
    const lineMat = new THREE.LineBasicMaterial({
      color: 0x00d4ff,
      transparent: true,
      opacity: 0.3,
    });
    globeLines = new THREE.LineSegments(lineGeo, lineMat);
    globeMesh.add(globeLines);
  }

  // Orbital ring
  const ringGeo = new THREE.TorusGeometry(2.6, 0.015, 8, 100);
  const ringMat = new THREE.MeshBasicMaterial({ color: 0x00d4ff, transparent: true, opacity: 0.3 });
  const ring1 = new THREE.Mesh(ringGeo, ringMat);
  ring1.rotation.x = Math.PI / 2.5;
  ring1.rotation.z = 0.3;
  globeScene.add(ring1);

  const ring2 = new THREE.Mesh(ringGeo.clone(), ringMat.clone());
  ring2.rotation.x = Math.PI / 1.8;
  ring2.rotation.z = -0.5;
  ring2.material.color = new THREE.Color(0x7c3aed);
  ring2.material.opacity = 0.2;
  globeScene.add(ring2);

  // Lights for globe
  const gLight1 = new THREE.PointLight(0x00d4ff, 2, 20);
  gLight1.position.set(5, 3, 5);
  globeScene.add(gLight1);

  const gLight2 = new THREE.PointLight(0x7c3aed, 1.5, 20);
  gLight2.position.set(-5, -3, 3);
  globeScene.add(gLight2);

  const gAmbient = new THREE.AmbientLight(0xffffff, 0.3);
  globeScene.add(gAmbient);

  animateGlobe();
}

function animateGlobe() {
  requestAnimationFrame(animateGlobe);

  if (!globeMesh) return;

  const elapsed = clock.getElapsedTime();

  // Rotate globe
  globeMesh.rotation.y = elapsed * 0.2 + targetMouseX * 0.3;
  globeMesh.rotation.x = Math.sin(elapsed * 0.1) * 0.1 + targetMouseY * 0.2;

  // Pulse nodes
  globeNodes.forEach((node) => {
    const scale = 1 + Math.sin(elapsed * node.userData.pulseSpeed + node.userData.pulseOffset) * 0.5;
    node.scale.setScalar(scale);
    node.material.opacity = 0.5 + Math.sin(elapsed * node.userData.pulseSpeed + node.userData.pulseOffset) * 0.5;
  });

  globeRenderer.render(globeScene, globeCamera);
}


// ======================================================
// ===== WAVE CANVAS (BETWEEN SECTIONS) =================
// ======================================================
function initWaveCanvas() {
  const canvas = document.getElementById('wave-canvas');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  let width, height;

  function resize() {
    width = canvas.parentElement.clientWidth;
    height = canvas.parentElement.clientHeight;
    canvas.width = width * window.devicePixelRatio;
    canvas.height = height * window.devicePixelRatio;
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
  }

  resize();
  window.addEventListener('resize', resize);

  function getWaveY(x, wave, time) {
    return height * 0.55 + wave.yOffset +
      Math.sin(x * wave.frequency + time * wave.speed) * wave.amplitude +
      Math.sin(x * wave.frequency * 2.5 + time * wave.speed * 1.5) * wave.amplitude * 0.3;
  }

  function drawWave() {
    ctx.clearRect(0, 0, width, height);
    const time = Date.now() * 0.001;

    // Draw 3 layered waves with gradient fills that fade out
    const waves = [
      { amplitude: 18, frequency: 0.015, speed: 0.8, r: 0, g: 212, b: 255, alpha: 0.12, yOffset: 0 },
      { amplitude: 14, frequency: 0.02, speed: 1.2, r: 124, g: 58, b: 237, alpha: 0.10, yOffset: 12 },
      { amplitude: 22, frequency: 0.01, speed: 0.5, r: 0, g: 212, b: 255, alpha: 0.06, yOffset: -8 },
    ];

    waves.forEach((wave) => {
      // Create gradient fill that fades from wave line to bottom
      const grad = ctx.createLinearGradient(0, height * 0.35, 0, height);
      grad.addColorStop(0, `rgba(${wave.r}, ${wave.g}, ${wave.b}, ${wave.alpha})`);
      grad.addColorStop(1, `rgba(${wave.r}, ${wave.g}, ${wave.b}, 0)`);

      ctx.beginPath();
      ctx.moveTo(0, height);
      for (let x = 0; x <= width; x += 2) {
        ctx.lineTo(x, getWaveY(x, wave, time));
      }
      ctx.lineTo(width, height);
      ctx.closePath();
      ctx.fillStyle = grad;
      ctx.fill();

      // Draw wave stroke line
      ctx.beginPath();
      for (let x = 0; x <= width; x += 2) {
        const y = getWaveY(x, wave, time);
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = `rgba(${wave.r}, ${wave.g}, ${wave.b}, 0.35)`;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    });

    // Draw glowing dots on first wave
    for (let x = 0; x <= width; x += 80) {
      const y = getWaveY(x, waves[0], time);

      const glow = ctx.createRadialGradient(x, y, 0, x, y, 6);
      glow.addColorStop(0, 'rgba(0, 212, 255, 0.8)');
      glow.addColorStop(1, 'rgba(0, 212, 255, 0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(x, y, 6, 0, Math.PI * 2);
      ctx.fill();
    }

    requestAnimationFrame(drawWave);
  }

  drawWave();
}


// ======================================================
// ===== MOUSE TRACKING =================================
// ======================================================
document.addEventListener('mousemove', (e) => {
  mouseX = (e.clientX / window.innerWidth) * 2 - 1;
  mouseY = -(e.clientY / window.innerHeight) * 2 + 1;
});

// ===== CUSTOM CURSOR =====
const cursor = document.querySelector('.cursor');
const follower = document.querySelector('.cursor-follower');

if (cursor && follower) {
  document.addEventListener('mousemove', (e) => {
    cursor.style.left = e.clientX + 'px';
    cursor.style.top = e.clientY + 'px';

    setTimeout(() => {
      follower.style.left = e.clientX + 'px';
      follower.style.top = e.clientY + 'px';
    }, 80);
  });

  const interactiveElements = document.querySelectorAll('a, button, .project-card, .stat-card, .tech-category, .case-card, .cert-card, .blog-card, .repo-card, .timeline-content, .github-profile, input, textarea, .skills-sphere span');
  interactiveElements.forEach((el) => {
    el.addEventListener('mouseenter', () => {
      cursor.classList.add('active');
      follower.classList.add('active');
    });
    el.addEventListener('mouseleave', () => {
      cursor.classList.remove('active');
      follower.classList.remove('active');
    });
  });
}

// ===== RESIZE HANDLER =====
window.addEventListener('resize', () => {
  if (camera && renderer) {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  }

  if (globeCamera && globeRenderer) {
    const canvas = document.getElementById('hero-globe-canvas');
    if (canvas) {
      let w = canvas.clientWidth;
      let h = canvas.clientHeight;
      if (w === 0 || h === 0) {
        const parentRect = canvas.parentElement.getBoundingClientRect();
        w = Math.round(parentRect.width * 0.55) || 600;
        h = parentRect.height || window.innerHeight;
      }
      if (w > 0 && h > 0) {
        globeCamera.aspect = w / h;
        globeCamera.updateProjectionMatrix();
        globeRenderer.setSize(w, h);
      }
    }
  }
});

// ===== NAVIGATION =====
const navbar = document.getElementById('navbar');
const navLinks = document.querySelectorAll('.nav-link');
const hamburger = document.querySelector('.hamburger');
const mobileMenu = document.querySelector('.mobile-menu');
const mobileLinks = document.querySelectorAll('.mobile-link');
const scrollProgress = document.querySelector('.scroll-progress');

window.addEventListener('scroll', () => {
  const scrollY = window.scrollY;

  if (navbar) {
    if (scrollY > 50) navbar.classList.add('scrolled');
    else navbar.classList.remove('scrolled');
  }

  if (scrollProgress) {
    const docHeight = document.documentElement.scrollHeight - window.innerHeight;
    const scrollPercent = docHeight > 0 ? (scrollY / docHeight) * 100 : 0;
    scrollProgress.style.width = scrollPercent + '%';
  }

  const sections = document.querySelectorAll('section[id]');
  sections.forEach((section) => {
    const sectionTop = section.offsetTop - 100;
    const sectionHeight = section.offsetHeight;
    const sectionId = section.getAttribute('id');

    if (scrollY >= sectionTop && scrollY < sectionTop + sectionHeight) {
      navLinks.forEach((link) => link.classList.remove('active'));
      const activeLink = document.querySelector(`.nav-link[data-section="${sectionId}"]`);
      if (activeLink) activeLink.classList.add('active');
    }
  });
});

if (hamburger) {
  hamburger.addEventListener('click', () => {
    hamburger.classList.toggle('active');
    if (mobileMenu) mobileMenu.classList.toggle('active');
  });
}

mobileLinks.forEach((link) => {
  link.addEventListener('click', () => {
    if (hamburger) hamburger.classList.remove('active');
    if (mobileMenu) mobileMenu.classList.remove('active');
  });
});

// ===== TYPING EFFECT =====
const typedTextEl = document.getElementById('typed-text');
const titles = (
  window.__SITE__ &&
  window.__SITE__.hero &&
  Array.isArray(window.__SITE__.hero.titles) &&
  window.__SITE__.hero.titles.length
)
  ? window.__SITE__.hero.titles
  : [
      'Software Developer',
      'Drupal Expert',
      'Full-Stack Developer',
      'Agile Practitioner',
      'Backend Specialist',
    ];
let titleIndex = 0;
let charIndex = 0;
let isDeleting = false;
let typingSpeed = 100;

function typeEffect() {
  const currentTitle = titles[titleIndex];

  if (isDeleting) {
    typedTextEl.textContent = currentTitle.substring(0, charIndex - 1);
    charIndex--;
    typingSpeed = 50;
  } else {
    typedTextEl.textContent = currentTitle.substring(0, charIndex + 1);
    charIndex++;
    typingSpeed = 100;
  }

  if (!isDeleting && charIndex === currentTitle.length) {
    isDeleting = true;
    typingSpeed = 2000;
  } else if (isDeleting && charIndex === 0) {
    isDeleting = false;
    titleIndex = (titleIndex + 1) % titles.length;
    typingSpeed = 500;
  }

  setTimeout(typeEffect, typingSpeed);
}

if (typedTextEl) setTimeout(typeEffect, 2500);

// ===== GSAP SCROLL ANIMATIONS =====
gsap.registerPlugin(ScrollTrigger);

function scrollReveal(targets, fromVars, toVars, triggerEl, staggerVal) {
  const els = gsap.utils.toArray(targets);
  if (!els.length) return null;

  let trigger = triggerEl || targets;
  if (typeof trigger === 'string') {
    const t = document.querySelector(trigger);
    trigger = t || els[0];
  }

  const tl = gsap.timeline({
    scrollTrigger: {
      trigger,
      start: 'top 90%',
      toggleActions: 'play none none none',
    },
  });

  const to = Object.assign({ opacity: 1, x: 0, y: 0, scale: 1, duration: 0.8, ease: 'power3.out' }, toVars);
  if (staggerVal) to.stagger = staggerVal;

  tl.fromTo(targets, Object.assign({ opacity: 0 }, fromVars), to);
  return tl;
}

gsap.utils.toArray('.section-title').forEach((title) => {
  scrollReveal(title, { y: 50 }, { duration: 0.8 });
});

scrollReveal('.about-text', { x: -60 }, { duration: 1 });
scrollReveal('.stat-card', { y: 60 }, { duration: 0.8 }, '.about-stats', 0.15);
scrollReveal('.section-subtitle', { y: 30 }, { duration: 0.8 });

gsap.utils.toArray('.timeline-item').forEach((item, i) => {
  scrollReveal(item, { x: i % 2 === 0 ? -60 : 60 }, { duration: 0.8 });
});

const skillProgressBars = document.querySelectorAll('.skill-progress');
skillProgressBars.forEach((bar) => {
  const width = bar.getAttribute('data-width');

  ScrollTrigger.create({
    trigger: bar,
    start: 'top 95%',
    onEnter: () => {
      bar.style.width = width + '%';
      bar.classList.add('animated');
    },
  });

  setTimeout(() => {
    if (bar.style.width === '0px' || bar.style.width === '' || bar.style.width === '0') {
      bar.style.width = width + '%';
      bar.classList.add('animated');
    }
  }, 3500);
});

scrollReveal('.tech-category', { y: 60 }, { duration: 0.8 }, '.techstack-grid', 0.12);

// Skills sphere: only animate opacity, not transform (CSS handles the 3D rotation)
gsap.fromTo('.skills-sphere-wrapper',
  { opacity: 0 },
  {
    opacity: 1,
    duration: 1.2,
    ease: 'power3.out',
    scrollTrigger: {
      trigger: '.skills-sphere-wrapper',
      start: 'top 90%',
      toggleActions: 'play none none none',
    },
  }
);
scrollReveal('.project-card', { y: 80 }, { duration: 0.6 }, '.projects-grid', 0.1);
scrollReveal('.case-card', { y: 60 }, { duration: 0.7 }, '.casestudies-grid', 0.12);
scrollReveal('.cert-card', { y: 60 }, { duration: 0.7 }, '.certifications-grid', 0.12);
scrollReveal('.blog-card', { y: 60 }, { duration: 0.7 }, '.blog-grid', 0.12);
scrollReveal('.github-profile', { x: -60 }, { duration: 0.9 }, '.github-wrapper');
scrollReveal('.repo-card', { y: 40 }, { duration: 0.6 }, '.repos-grid', 0.08);
scrollReveal('.achievement-card', { y: 60 }, { duration: 0.6 }, '.achievements-grid', 0.1);
scrollReveal('.edu-card', { y: 40 }, { duration: 0.8 }, '.education-cards', 0.2);
scrollReveal('.contact-info', { x: -60 }, { duration: 1 }, '.contact-grid');
scrollReveal('.contact-form', { x: 60 }, { duration: 1 }, '.contact-grid');
scrollReveal('.project-filter', { y: 30 }, { duration: 0.6 });

// ===== COUNTER ANIMATION =====
const statNumbers = document.querySelectorAll('.stat-number');
statNumbers.forEach((num) => {
  const target = parseInt(num.getAttribute('data-count'));
  let animated = false;

  ScrollTrigger.create({
    trigger: num,
    start: 'top 95%',
    onEnter: () => {
      if (!animated) {
        animated = true;
        gsap.to(num, {
          innerHTML: target,
          duration: 2,
          snap: { innerHTML: 1 },
          ease: 'power2.out',
        });
      }
    },
  });

  setTimeout(() => {
    if (!animated) {
      animated = true;
      num.textContent = target;
    }
  }, 4000);
});

// ===== VISIBILITY FALLBACK =====
setTimeout(() => {
  document.querySelectorAll('.section-title, .section-subtitle, .about-text, .stat-card, .tech-category, .timeline-item, .project-card, .case-card, .cert-card, .blog-card, .github-profile, .repo-card, .achievement-card, .edu-card, .contact-info, .contact-form, .project-filter').forEach((el) => {
    if (getComputedStyle(el).opacity === '0') {
      el.style.opacity = '1';
      el.style.transform = 'none';
    }
  });
  // Sphere wrapper: only fix opacity, never touch transform (CSS 3D rotation)
  const sphere = document.querySelector('.skills-sphere-wrapper');
  if (sphere && getComputedStyle(sphere).opacity === '0') {
    sphere.style.opacity = '1';
  }
}, 5000);

// ===== PROJECT FILTER =====
const filterBtns = document.querySelectorAll('.filter-btn');
const projectCards = document.querySelectorAll('.project-card');

filterBtns.forEach((btn) => {
  btn.addEventListener('click', () => {
    filterBtns.forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');

    const filter = btn.getAttribute('data-filter');

    projectCards.forEach((card) => {
      const category = card.getAttribute('data-category');

      if (filter === 'all' || category === filter) {
        card.classList.remove('hidden');
        gsap.fromTo(card,
          { scale: 0.8, opacity: 0 },
          { scale: 1, opacity: 1, duration: 0.4, ease: 'power2.out' }
        );
      } else {
        card.classList.add('hidden');
      }
    });
  });
});

// ===== 3D TILT EFFECT (MORE DRAMATIC) =====
const tiltElements = document.querySelectorAll('[data-tilt]');

tiltElements.forEach((el) => {
  el.addEventListener('mousemove', (e) => {
    const rect = el.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    const rotateX = (y - centerY) / centerY * -12;
    const rotateY = (x - centerX) / centerX * 12;

    // Calculate light position for dynamic glow
    const glowX = (x / rect.width) * 100;
    const glowY = (y / rect.height) * 100;

    el.style.transform = `perspective(800px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale3d(1.04, 1.04, 1.04)`;
    el.style.background = `radial-gradient(circle at ${glowX}% ${glowY}%, rgba(0,212,255,0.08) 0%, rgba(26,26,46,0.7) 60%)`;
  });

  el.addEventListener('mouseleave', () => {
    el.style.transform = 'perspective(800px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)';
    el.style.background = '';
    el.style.transition = 'transform 0.5s ease, background 0.5s ease';
  });

  el.addEventListener('mouseenter', () => {
    el.style.transition = 'none';
  });
});

// ===== CONTACT FORM =====
const contactForm = document.getElementById('contact-form');
if (contactForm) {
  contactForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const submitBtn = contactForm.querySelector('.btn-submit');
    const originalContent = submitBtn.innerHTML;

    const name = document.getElementById('name')?.value?.trim() || '';
    const email = document.getElementById('email')?.value?.trim() || '';
    const subject = document.getElementById('subject')?.value?.trim() || '';
    const message = document.getElementById('message')?.value?.trim() || '';

    submitBtn.innerHTML = '<span>Sending...</span><i class="fas fa-spinner fa-spin"></i>';
    submitBtn.disabled = true;

    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, subject, message }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data.ok) {
        const msg = data.error || 'Failed to send.';
        submitBtn.innerHTML = `<span>${msg}</span><i class="fas fa-triangle-exclamation"></i>`;
        submitBtn.style.background = 'linear-gradient(135deg, #ef4444, #b91c1c)';
        setTimeout(() => {
          submitBtn.innerHTML = originalContent;
          submitBtn.style.background = '';
          submitBtn.disabled = false;
        }, 3500);
        return;
      }

      submitBtn.innerHTML = '<span>Message Sent!</span><i class="fas fa-check"></i>';
      submitBtn.style.background = 'linear-gradient(135deg, #10b981, #059669)';

      setTimeout(() => {
        submitBtn.innerHTML = originalContent;
        submitBtn.style.background = '';
        submitBtn.disabled = false;
        contactForm.reset();
      }, 2500);
    } catch {
      submitBtn.innerHTML = '<span>Network error</span><i class="fas fa-triangle-exclamation"></i>';
      submitBtn.style.background = 'linear-gradient(135deg, #ef4444, #b91c1c)';
      setTimeout(() => {
        submitBtn.innerHTML = originalContent;
        submitBtn.style.background = '';
        submitBtn.disabled = false;
      }, 3500);
    }
  });
}

// ===== SMOOTH SCROLL =====
document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
  anchor.addEventListener('click', function (e) {
    const target = document.querySelector(this.getAttribute('href'));
    if (target) {
      e.preventDefault();
      const offset = 70;
      const targetPosition = target.getBoundingClientRect().top + window.scrollY - offset;
      window.scrollTo({ top: targetPosition, behavior: 'smooth' });
    }
  });
});

// ===== PARALLAX ON SCROLL =====
window.addEventListener('scroll', () => {
  const scrollY = window.scrollY;
  geometries.forEach((mesh, i) => {
    mesh.position.z = mesh.userData.initialY * 0.1 + Math.sin(scrollY * 0.001 + i) * 3;
  });
});

// ===== MOUSE TRAIL PARTICLES (CSS) =====
document.addEventListener('mousemove', (e) => {
  if (Math.random() > 0.85) {
    const trail = document.createElement('div');
    trail.style.cssText = `
      position: fixed;
      left: ${e.clientX}px;
      top: ${e.clientY}px;
      width: 4px;
      height: 4px;
      border-radius: 50%;
      background: rgba(0, 212, 255, 0.6);
      pointer-events: none;
      z-index: 9998;
      transform: translate(-50%, -50%);
      box-shadow: 0 0 6px rgba(0, 212, 255, 0.4);
    `;
    document.body.appendChild(trail);

    gsap.to(trail, {
      opacity: 0,
      scale: 0,
      duration: 0.8,
      ease: 'power2.out',
      onComplete: () => trail.remove(),
    });
  }
});

// ======================================================
// ===== INITIALIZE EVERYTHING ==========================
// ======================================================
initThreeJS();
// Delay globe init to ensure canvas has layout dimensions
requestAnimationFrame(() => {
  initHeroGlobe();
});
initWaveCanvas();
