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
const sliderVoladizo = document.getElementById('slider-voladizo'); // Corregido vinculación
const sliderGrosor = document.getElementById('slider-grosor');
const sliderSubdiv = document.getElementById('slider-subdiv');
const checkSolid = document.getElementById('check-viga-solida');
const btnRotation = document.getElementById('btn-rotation'); // Corregido vinculación

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

    // 1. Matriz de puntos base sobre la superficie
    let grid = [];
    for (let i = 0; i <= subdiv; i++) {
        grid[i] = [];
        for (let j = 0; j <= subdiv; j++) {
            grid[i][j] = getSurfacePoint(surfaceType, i / subdiv, j / subdiv);
        }
    }

    // 2. Procesamiento topológico de aristas según el N-Gon elegido
    for (let i = 0; i < subdiv; i++) {
        for (let j = 0; j < subdiv; j++) {
            
            let p00 = grid[i][j];
            let p10 = grid[i+1][j];
            let p01 = grid[i][j+1];
            let p11 = grid[i+1][j+1];

            let edges = [];

            // PATRÓN TRIANGULAR: Requiere el marco perimetral + ambas diagonales para cerrar los polígonos
            if (sides === 3) {
                edges.push({ v1: p00, v2: p10, next1: p01, next2: p11 });
                edges.push({ v1: p00, v2: p01, next1: p10, next2: p11 });
                edges.push({ v1: p00, v2: p11, next1: p10, next2: p01 });
                edges.push({ v1: p10, v2: p01, next1: p00, next2: p11 });
            }
            
            // PATRÓN CUADRADO O PENTAGONAL BASE
            if (sides === 4 || sides === 5) {
                edges.push({ v1: p00, v2: p10, next1: p01, next2: p11 });
                edges.push({ v1: p00, v2: p01, next1: p10, next2: p11 });
            }

            // PATRÓN HEXAGONAL / OCTAGONAL PARAMÉTRICO (Subdivisión radial interna por celda)
            if (sides === 6 || sides === 8) {
                // Calculamos un centro geométrico en la celda para tejer los polígonos radiales
                let centroCelda = new THREE.Vector3().addVectors(p00, p11).multiplyScalar(0.5);
                let listaPuntos = [p00, p10, p11, p01];
                
                for(let j=0; j<4; j++) {
                    let pA = listaPuntos[j];
                    let pB = listaPuntos[(j+1)%4];
                    // Genera radios hacia el centro simulando las subdivisiones del polígono complejo
                    edges.push({ v1: pA, v2: centroCelda, next1: pB, next2: p00 });
                    if(sides === 8) {
                        edges.push({ v1: pA, v2: pB, next1: centroCelda, next2: p11 });
                    }
                }
            }

            // 3. Renderizado físico y cálculo del desfase recíproco
            edges.forEach(edge => {
                let dir = new THREE.Vector3().subVectors(edge.v2, edge.v1);
                let longitudOriginal = dir.length();
                if(longitudOriginal < 0.01) return;
                dir.normalize();

                let perpendicular = new THREE.Vector3().subVectors(edge.next1, edge.v1).cross(dir).normalize();
                let vOffset = new THREE.Vector3().copy(perpendicular).multiplyScalar(offset * 0.8);

                let pInicio = new THREE.Vector3().copy(edge.v1).addScaledVector(dir, offset * longitudOriginal).add(vOffset);
                let pFin = new THREE.Vector3().copy(edge.v2).addScaledVector(dir, -offset * longitudOriginal).add(vOffset);

                let dirBarra = new THREE.Vector3().subVectors(pFin, pInicio);
                dirBarra.normalize();
                
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

// Incluido explícitamente sliderVoladizo en la matriz de escucha de cambios
[sliderOffset, sliderVoladizo, sliderGrosor, sliderSubdiv].forEach(slider => {
    slider.addEventListener('input', generateReciprocalStructure);
});

// --- LOGIC FOR PASSIVE ROTATION BUTTON ---
btnRotation.addEventListener('click', () => {
    isRotating = !isRotating;
    if (isRotating) {
        btnRotation.innerText = "PAUSE ROTATION";
        btnRotation.style.borderColor = "#ff5500";
        btnRotation.style.color = "#ff5500";
    } else {
        btnRotation.innerText = "RESUME ROTATION";
        btnRotation.style.borderColor = "#00f3ff";
        btnRotation.style.color = "#00f3ff";
    }
});

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});
// --- LOGIC TO MINIMIZE / MAXIMIZE THE HUD ---
const hudContainer = document.getElementById('hud-container');
const btnToggleHud = document.getElementById('btn-toggle-hud');
let isHudMinimized = false;

btnToggleHud.addEventListener('click', () => {
    isHudMinimized = !isHudMinimized;
    hudContainer.classList.toggle('minimized');
    
    if (isHudMinimized) {
        btnToggleHud.innerText = "[+ CONTROL_SYS]";
    } else {
        btnToggleHud.innerText = "_ MINIMIZE";
    }
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
