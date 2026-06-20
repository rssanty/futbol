const video = document.getElementById('tv-player');
const loader = document.getElementById('loader');
const statusMsg = document.getElementById('status-msg');
const containerCanales = document.getElementById('canales-container');
const tapToPlayBtn = document.getElementById('tap-to-play');
let hls = null;

// La URL con el JSON de Firebase encaletada en base64 pa' despistar a los curiosos
const betaOculto = 'aHR0cHM6Ly9wcnVlYmEtMTY5NzItZGVmYXVsdC1ydGRiLmZpcmViYXNlaW8uY29tL2NhbmFsX2Z1dGJvbF9jZWwuanNvbj9hdXRoPTdjTVJUQmZjYkVwRWRuTlc3dXZhN0s4SnRZYXdXZmRjamZ3NXRRZWk=';

// Desencriptamos la URL en caliente
const dbUrl = atob(betaOculto);

// Evento para activar audio o forzar play si el usuario toca la pantalla de play forzada
tapToPlayBtn.addEventListener('click', () => {
    video.muted = false;
    video.play().then(() => {
        tapToPlayBtn.classList.add('hidden');
        statusMsg.classList.add('hidden');
    }).catch(err => {
        // Si falla de nuevo, al menos que reproduzca sin sonido
        video.muted = true;
        video.play();
        tapToPlayBtn.classList.add('hidden');
        statusMsg.classList.remove('hidden');
    });
});

// Permitir desmutear tocando directamente la pantalla del reproductor
video.addEventListener('click', () => {
    if (video.muted) {
        video.muted = false;
        statusMsg.classList.add('hidden');
    }
});

async function cargarCanalesDesdeBD() {
    try {
        const respuesta = await fetch(dbUrl);
        const data = await respuesta.json();
        
        containerCanales.innerHTML = ''; // Limpiamos la pantalla de carga

        let primerCanalActivo = null;

        if (data && typeof data === 'object') {
            const canales = Array.isArray(data) ? data : Object.values(data);
            
            canales.forEach((canal, index) => {
                if (canal && canal.status === true) {
                    const nombreMostrar = canal.nombre ? canal.nombre.toUpperCase() : `CANAL ${index}`;
                    const idBtn = `btn-canal-${index}`;

                    const btn = document.createElement('button');
                    btn.id = idBtn;
                    btn.onclick = () => cambiarCanal(idBtn, canal.link);
                    btn.className = "w-full group relative flex items-center justify-center p-4 bg-gradient-to-r from-gray-800 to-gray-900 rounded-xl font-bold text-lg active:scale-[0.98] transition-all overflow-hidden shadow-lg border border-gray-600/50 text-gray-200 hover:text-white";
                    
                    btn.innerHTML = `<span class="relative z-10 flex items-center gap-2">📺 ${nombreMostrar}</span>`;
                    
                    containerCanales.appendChild(btn);

                    if (!primerCanalActivo) {
                        primerCanalActivo = { id: idBtn, link: canal.link };
                    }
                }
            });
        }

        if (primerCanalActivo) {
            cambiarCanal(primerCanalActivo.id, primerCanalActivo.link);
        } else {
            containerCanales.innerHTML = '<p class="text-center text-red-500 font-bold">Mano, no hay canales activos ahorita.</p>';
        }

    } catch (error) {
        console.error("Hubo un beta malo jalando los datos:", error);
        containerCanales.innerHTML = '<p class="text-center text-red-500 font-bold">Falló la conexión con la base de datos, mi bro.</p>';
    }
}

// Intenta reproducir de manera segura manejando el bloqueo de políticas de autoplay
function iniciarReproduccionSegura() {
    video.muted = false;
    const playPromise = video.play();

    if (playPromise !== undefined) {
        playPromise.then(() => {
            tapToPlayBtn.classList.add('hidden');
            statusMsg.classList.add('hidden');
        }).catch(error => {
            console.log("El navegador bloqueó la reproducción automática con audio. Reintentando silenciado...", error);
            video.muted = true;
            video.play().then(() => {
                tapToPlayBtn.classList.add('hidden');
                statusMsg.classList.remove('hidden');
            }).catch(err2 => {
                console.log("Ahorro de batería agresivo activo. Esperando toque del usuario.");
                tapToPlayBtn.classList.remove('hidden');
            });
        });
    }
}

function cambiarCanal(canalId, url) {
    loader.classList.remove('hidden');
    tapToPlayBtn.classList.add('hidden');
    statusMsg.classList.add('hidden');
    
    const botones = containerCanales.querySelectorAll('button');
    botones.forEach(b => {
        b.classList.remove('ring-2', 'ring-white', 'from-blue-700', 'to-blue-900');
        b.classList.add('from-gray-800', 'to-gray-900');
    });

    const btnActivo = document.getElementById(canalId);
    if (btnActivo) {
        btnActivo.classList.remove('from-gray-800', 'to-gray-900');
        btnActivo.classList.add('ring-2', 'ring-white', 'from-blue-700', 'to-blue-900');
    }

    if (Hls.isSupported()) {
        if (hls) { hls.destroy(); }
        
        hls = new Hls({
            liveSyncDurationCount: 3, 
            liveMaxLatencyDurationCount: 7 
        });
        
        hls.loadSource(url);
        hls.attachMedia(video);
        
        hls.on(Hls.Events.MANIFEST_PARSED, function(event, data) {
            loader.classList.add('hidden');
            
            if (data.levels && data.levels.length > 0) {
                hls.currentLevel = data.levels.length - 1;
            }

            iniciarReproduccionSegura();
        });

        hls.on(Hls.Events.ERROR, function (event, data) {
            if (data.fatal) {
                loader.classList.add('hidden');
                console.error("Error fatal en el stream HLS:", data);
            }
        });

    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = url;
        video.addEventListener('loadedmetadata', function() {
            loader.classList.add('hidden');
            iniciarReproduccionSegura();
        }, { once: true });
    }
}

window.addEventListener('DOMContentLoaded', () => {
    cargarCanalesDesdeBD();
});