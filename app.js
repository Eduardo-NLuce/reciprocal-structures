// --- CONFIGURACIÓN BASE DE THREE.JS ---
const container = document.getElementById('canvas-container');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x050201);

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 6, 9);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
container.appendChild(renderer.domElement);

const controls = new THREE.OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;

// Luces para enfatizar el volumen de los listones
const light1 = new THREE.DirectionalLight(0xff5500, 1.3);
light1.position.set(5, 12, 6);
scene.add(light1);

const light2 = new THREE.DirectionalLight(0x00f3ff, 0.9);
light2.position.set(-5, -3, -5);
scene.add(light2);

const ambientLight = new THREE.AmbientLight(0x0b0f19, 1.8);
scene.add(ambientLight);

// UI Elements
const selectSurface = document.getElementById('select-surface');
const selectPattern = document.getElementById('select-pattern');
const sliderOffset = document.getElementById('slider-offset');
const sliderVoladizo = document.getElementById('slider-voladizo');
const sliderGrosor = document.getElementById('slider-grosor');
const sliderSubdiv = document.getElementById('slider-subdiv');
const checkSolid = document.getElementById('check-viga-solida');
const btnRotation = document.getElementById('btn-rotation');

// Variables de estado de animación
let structureGroup = new THREE.Group();
scene.add(structureGroup);
let isRotating = true;

// --- ECUACIONES DE SUPERFICIES PARAMÉTRICAS ---
function getSurfacePoint(type, u, v) {
    let x = 0, y = 0, z = 0;
    let uu = u * Math.PI * 2; 

    switch(type) {
        case 'paraboloid':
            let r_p = v * 2.5;
            x = r_p * Math.cos(uu);
            z = r_p * Math.sin(uu);
            y = (x*x + z*z) * -0.22 + 2;
            break;
        case 'hypar':
            x = (u * 2 - 1) * 2.5;
            z = (v * 2 - 1) * 2.5;
            y = (x*x - z*z) * 0.25 + 1;
            break;
        case 'catenoid':
            let h = (v * 2 - 1) * 1.5;
            let c = 0.8;
            let r_c = c * Math.cosh(h / c);
            x = r_c * Math.cos(uu);
            z = r_c * Math.sin(uu);
            y = h + 1.2;
            break;
        case 'sphere':
            let theta = v * Math.PI * 0.5;
            x = 2.5 * Math.sin(theta) * Math.cos(uu);
            z = 2.5 * Math.sin(theta) * Math.sin(uu);
            y = 2.5 * Math.cos(theta);
            break;
        case 'ellipsoid':
            let t_e = v * Math.PI * 0.5;
            x = 3.0 * Math.sin(t_e) * Math.cos(uu);
            z = 1.8 * Math.sin(t_e) * Math.sin(uu);
            y = 2.0 * Math.cos(t_e);
            break;
    }
    return new THREE.Vector3(x, y, z);
}

// --- GENERADOR DE ESTRUCTURA RECÍPROCA INTER-CONECTADA ---
function generateReciprocalStructure() {
    while(structureGroup.children.length > 0) {
        structureGroup.remove(structureGroup.children[0]);
    }

    const surfaceType = selectSurface.value;
    const sides = parseInt(selectPattern.value);
    const offset = parseFloat(sliderOffset.value);
    const voladizoFactor = parseFloat(sliderVoladizo.value);
    const grosor = parseFloat(sliderGrosor.value);
    const subdiv = parseInt(sliderSubdiv.value);

    // Actualizar labels numéricos en el HUD
    document.getElementById('val-offset').innerText = offset.toFixed(2);
    document.getElementById('val-voladizo').innerText = voladizoFactor.toFixed(1);
    document.getElementById('val-grosor').innerText = grosor.toFixed(2);
    document.getElementById('val-subdiv').innerText = subdiv;

    const solidMaterial = new THREE.MeshPhongMaterial({
        color: 0xff5500,
        shininess: 90,
        specular: 0x00f3ff,
        side: THREE.DoubleSide
    });
    const wireMaterial = new THREE.LineBasicMaterial({ color: 0x00f3ff });

    let grid = [];
    for (let i = 0; i <= subdiv; i++) {
        grid[i] = [];
        for (let j = 0; j <= subdiv; j++) {
            grid[i][j] = getSurfacePoint(surfaceType, i / subdiv, j / subdiv);
        }
    }

    for (let i = 0; i < subdiv; i++) {
        for (let j = 0; j < subdiv; j++) {
            
            let p00 = grid[i][j];
            let p10 = grid[i+1][j];
            let p01 = grid[i][j+1];
            let p11 = grid[i+1][j+1];

            let edges = [];

            if (sides === 4 || sides === 5 || sides === 6 || sides === 8) {
                edges.push({ v1: p00, v2: p10, next1: p01, next2: p11 });
                edges.push({ v1: p00, v2: p01, next1: p10, next2: p11 });
            } 
            
            if (sides === 3 || sides === 5 || sides === 6 || sides === 8) {
                edges.push({ v1: p00, v2: p11, next1: p10, next2: p01 });
            }

            edges.forEach(edge => {
                let dir = new THREE.Vector3().subVectors(edge.v2, edge.v1);
                let longitudOriginal = dir.length();
                dir.normalize();

                let perpendicular = new THREE.Vector3().subVectors(edge.next1, edge.v1).cross(dir).normalize();
                let vOffset = new THREE.Vector3().copy(perpendicular).multiplyScalar(offset * 0.8);

                let pInicio = new THREE.Vector3().copy(edge.v1).addScaledVector(dir, offset * longitudOriginal).add(vOffset);
                let pFin = new THREE.Vector3().copy(edge.v2).addScaledVector(dir, -offset * longitudOriginal).add(vOffset);

                let dirBarra = new THREE.Vector3().subVectors(pFin, pInicio);
                dirBarra.normalize();
                
                // Aplicamos el factor dinámico del slider para el voladizo extra en los extremos
                let extension = grosor * voladizoFactor;
                pInicio.addScaledVector(dirBarra, -extension);
                pFin.addScaledVector(dirBarra, extension);
                let finalLen = pInicio.distanceTo(pFin);

                if (checkSolid.checked) {
                    let geomViga = new THREE.BoxGeometry(grosor * 1.6, grosor, finalLen);
                    let meshViga = new THREE.Mesh(geomViga, solidMaterial);

                    let puntoMedio = new THREE.Vector3().addVectors(pInicio, pFin).multiplyScalar(0.5);
                    meshViga.position.copy(puntoMedio);
                    meshViga.lookAt(pFin);

                    structureGroup.add(meshViga);
                } else {
                    let geomLinea = new THREE.BufferGeometry().setFromPoints([pInicio, pFin]);
                    let linea = new THREE.Line(geomLinea, wireMaterial);
                    structureGroup.add(linea);
                }
            });
        }
    }
}

// --- EVENT LISTENERS ---
[selectSurface, selectPattern, checkSolid].forEach(elem => {
    elem.addEventListener('change', generateReciprocalStructure);
});

[sliderOffset, sliderVoladizo, sliderGrosor, sliderSubdiv].forEach(slider => {
    slider.addEventListener('input', generateReciprocalStructure);
});

// Lógica interactiva del botón de rotación pasiva
btnRotation.addEventListener('click', () => {
    isRotating = !isRotating;
    if (isRotating) {
        btnRotation.innerText = "PAUSAR ROTACIÓN";
        btnRotation.style.borderColor = "var(--neon-orange)";
        btnRotation.style.color = "var(--neon-orange)";
    } else {
        btnRotation.innerText = "REANUDAR ROTACIÓN";
        btnRotation.style.borderColor = "var(--neon-cyan)";
        btnRotation.style.color = "var(--neon-cyan)";
    }
});

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// --- BUCLE DE ANIMACIÓN ---
function animate() {
    requestAnimationFrame(animate);
    
    // Solo aplica rotación automática si la bandera isRotating es verdadera
    if (isRotating) {
        structureGroup.rotation.y += 0.001;
    }

    controls.update();
    renderer.render(scene, camera);
}

generateReciprocalStructure();
animate();
