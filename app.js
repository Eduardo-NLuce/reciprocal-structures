// --- CONFIGURACIÓN BASE DE THREE.JS ---
const container = document.getElementById('canvas-container');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x050201);

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 5, 8);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
container.appendChild(renderer.domElement);

const controls = new THREE.OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;

// Iluminación dual (Estilo laboratorio cibernético)
const light1 = new THREE.DirectionalLight(0xff5500, 1.2);
light1.position.set(5, 10, 5);
scene.add(light1);

const light2 = new THREE.DirectionalLight(0x00f3ff, 0.8);
light2.position.set(-5, -5, -5);
scene.add(light2);

const ambientLight = new THREE.AmbientLight(0x0a0f1d, 1.5);
scene.add(ambientLight);

// Referencia de UI
const selectSurface = document.getElementById('select-surface');
const selectPattern = document.getElementById('select-pattern');
const sliderOffset = document.getElementById('slider-offset');
const sliderGrosor = document.getElementById('slider-grosor');
const sliderSubdiv = document.getElementById('slider-subdiv');
const checkSolid = document.getElementById('check-viga-solida');

// Contenedor principal de la estructura generada
let structureGroup = new THREE.Group();
scene.add(structureGroup);

// --- ECUACIONES DE SUPERFICIES PARAMÉTRICAS ---
function getSurfacePoint(type, u, v) {
    let x = 0, y = 0, z = 0;
    // Mapeo de u y v de [0,1] a rangos geométricos
    let uu = u * Math.PI * 2; 
    let vv = v; 

    switch(type) {
        case 'paraboloid': // Paraboloide: z = x^2 + y^2
            let r_p = v * 2.5;
            x = r_p * Math.cos(uu);
            z = r_p * Math.sin(uu);
            y = (x*x + z*z) * -0.25 + 2; // Invertido para cúpula
            break;

        case 'hypar': // Paraboloide Hiperbólico (Silla de montar)
            x = (u * 2 - 1) * 2.5;
            z = (v * 2 - 1) * 2.5;
            y = (x*x - z*z) * 0.2 + 1;
            break;

        case 'catenoid': // Catenaroide
            let h = (v * 2 - 1) * 1.5;
            let c = 0.8;
            let r_c = c * Math.cosh(h / c);
            x = r_c * Math.cos(uu);
            z = r_c * Math.sin(uu);
            y = h + 1.5;
            break;

        case 'sphere': // Semi-Esfera
            let theta = v * Math.PI * 0.5; // Solo domo superior
            x = 2.5 * Math.sin(theta) * Math.cos(uu);
            z = 2.5 * Math.sin(theta) * Math.sin(uu);
            y = 2.5 * Math.cos(theta);
            break;

        case 'ellipsoid': // Semi-Elipsoide
            let t_e = v * Math.PI * 0.5;
            x = 3.0 * Math.sin(t_e) * Math.cos(uu);
            z = 1.8 * Math.sin(t_e) * Math.sin(uu); // Eje z achatado
            y = 2.0 * Math.cos(t_e);
            break;
    }
    return new THREE.Vector3(x, y, z);
}

// --- ALGORITMO GENERADOR RECÍPROCO ---
function generateReciprocalStructure() {
    // Limpiar geometría anterior
    while(structureGroup.children.length > 0) {
        structureGroup.remove(structureGroup.children[0]);
    }

    const surfaceType = selectSurface.value;
    const sides = parseInt(selectPattern.value);
    const offset = parseFloat(sliderOffset.value);
    const grosor = parseFloat(sliderGrosor.value);
    const subdiv = parseInt(sliderSubdiv.value);

    // Actualizar labels del HUD
    document.getElementById('val-offset').innerText = offset.toFixed(2);
    document.getElementById('val-grosor').innerText = grosor.toFixed(2);
    document.getElementById('val-subdiv').innerText = subdiv;

    // Definición de materiales de neón
    const solidMaterial = new THREE.MeshPhongMaterial({
        color: 0xff5500,
        shininess: 80,
        specular: 0x00f3ff,
        side: THREE.DoubleSide
    });

    const wireMaterial = new THREE.LineBasicMaterial({ color: 0x00f3ff });

    // 1. Mapeo espacial de la rejilla para generar las celdas n-gonal estructurales
    for (let i = 0; i < subdiv; i++) {
        for (let j = 1; j <= subdiv; j++) {
            
            // Definir esquinas de la celda matemática base en rango UV
            let u0 = i / subdiv;
            let u1 = (i + 1) / subdiv;
            let v0 = (j - 1) / subdiv;
            let v1 = j / subdiv;

            // Recopilar vértices de soporte sobre la superficie paramétrica
            let corners = [];
            if (sides === 3) {
                corners = [
                    getSurfacePoint(surfaceType, u0, v0),
                    getSurfacePoint(surfaceType, u1, v0),
                    getSurfacePoint(surfaceType, (u0+u1)*0.5, v1)
                ];
            } else if (sides === 4) {
                corners = [
                    getSurfacePoint(surfaceType, u0, v0),
                    getSurfacePoint(surfaceType, u1, v0),
                    getSurfacePoint(surfaceType, u1, v1),
                    getSurfacePoint(surfaceType, u0, v1)
                ];
            } else {
                // Para 5, 6 y 8 lados, extrapolamos de forma circular sobre el parche UV
                let centroU = (u0 + u1) * 0.5;
                let centroV = (v0 + v1) * 0.5;
                let radioU = (u1 - u0) * 0.5;
                let radioV = (v1 - v0) * 0.5;

                for (let n = 0; n < sides; n++) {
                    let angle = (n / sides) * Math.PI * 2;
                    let uN = centroU + radioU * Math.cos(angle);
                    let vN = centroV + radioV * Math.sin(angle);
                    corners.push(getSurfacePoint(surfaceType, uN, vN));
                }
            }

            // Centro de masa local de la celda
            let centro = new THREE.Vector3();
            corners.forEach(p => centro.add(p));
            centro.divideScalar(corners.length);

            // 2. Tectónica Recíproca: Crear los elementos entrelazados (Efecto Molino)
            for (let k = 0; k < corners.length; k++) {
                let pActual = corners[k];
                let pSiguiente = corners[(k + 1) % corners.length];

                // Interpolación lineal del punto de apoyo según el offset paramétrico
                let puntoApoyo = new THREE.Vector3().lerpVectors(pActual, pSiguiente, 0.5 + offset);
                
                // Vector que define el eje longitudinal de la viga estructural
                let pInicio = pActual;
                let pFin = new THREE.Vector3().lerpVectors(puntoApoyo, centro, 1.2);

                let vigaLongitud = pInicio.distanceTo(pFin);

                if (checkSolid.checked) {
                    // Generación del componente sólido (Viga de sección rectangular cuadrangular)
                    let geomViga = new THREE.BoxGeometry(grosor, grosor, vigaLongitud);
                    let meshViga = new THREE.Mesh(geomViga, solidMaterial);

                    // Posicionar en el punto medio del vector
                    let puntoMedio = new THREE.Vector3().addVectors(pInicio, pFin).multiplyScalar(0.5);
                    meshViga.position.copy(puntoMedio);

                    // Orientar la matriz tridimensional del objeto hacia el nodo destino
                    meshViga.lookAt(pFin);
                    structureGroup.add(meshViga);
                } else {
                    // Representación alámbrica pura (Look holograma de vectores)
                    let geomLinea = new THREE.BufferGeometry().setFromPoints([pInicio, pFin]);
                    let linea = new THREE.Line(geomLinea, wireMaterial);
                    structureGroup.add(linea);
                }
            }
        }
    }
}

// --- EVENT LISTENERS (INTERACTIVIDAD) ---
[selectSurface, selectPattern, checkSolid].forEach(elem => {
    elem.addEventListener('change', generateReciprocalStructure);
});

[sliderOffset, sliderGrosor, sliderSubdiv].forEach(slider => {
    slider.addEventListener('input', generateReciprocalStructure);
});

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// --- LOOP DE ANIMACIÓN ---
function animate() {
    requestAnimationFrame(animate);
    
    // Rotación de órbita pasiva muy leve
    structureGroup.rotation.y += 0.0015;

    controls.update();
    renderer.render(scene, camera);
}

// Inicialización automática
generateReciprocalStructure();
animate();
