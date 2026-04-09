import React, { useState, useEffect, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import { 
  getFirestore, collection, doc, setDoc, updateDoc, deleteDoc, addDoc, 
  onSnapshot, enableIndexedDbPersistence, serverTimestamp, arrayUnion 
} from 'firebase/firestore';
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, signOut } from 'firebase/auth';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { APIProvider, Map, AdvancedMarker, Pin, useMap } from '@vis.gl/react-google-maps';

// --- MAP CONTROLLER ---
const MapController = ({ targetCenter }) => {
   const map = useMap();
   useEffect(() => {
      if (map && targetCenter) {
         map.panTo(targetCenter);
      }
   }, [map, targetCenter]);
   return null;
};

// --- FIREBASE CONFIGURATION ---
const firebaseConfig = {
  apiKey: "AIzaSyAEzXz42Zih7M6yY97_4e8_E1BNsjbJhnI",
  authDomain: "timings-ak.firebaseapp.com",
  projectId: "timings-ak",
  storageBucket: "timings-ak.firebasestorage.app",
  messagingSenderId: "1082790063422",
  appId: "1:1082790063422:web:be439e3d932475a9fe906f"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
const functions = getFunctions(app);
const extractLocationCall = httpsCallable(functions, 'extractLocation');
const provider = new GoogleAuthProvider();

enableIndexedDbPersistence(db).catch(() => {});

// --- CONSTANTS ---
const GOOGLE_MAPS_API_KEY = "AIzaSyCZvsxPuTCY3J-WhWLGdeOdPhLs_Twg1DI";

const prayersList = [
  { id: 'fajr', name: 'Fajr', arabic: 'فَجْرٌ', icon: 'fa-cloud-sun' },
  { id: 'zuhr', name: 'Ẓuhr', arabic: 'ظُهْرٌ', icon: 'fa-sun' },
  { id: 'asr', name: 'Aṣr', arabic: 'عَصْرٌ', icon: 'fa-cloud' },
  { id: 'isha', name: 'Ishā', arabic: 'عِشَاءٌ', icon: 'fa-moon' },
  { id: 'jumma', name: 'Jummah', arabic: 'جُمُعَةٌ', icon: 'fa-users' }
];

const sequenceOrder = ['fajr', 'zuhr', 'asr', 'isha'];
const specialPrayersList = [
  { id: 'taraweeh', name: 'Tarāweeḥ', type: 'parahs', mode: 'ramadan' },
  { id: 'eidFitr', name: 'Eid-ul-Fiṭr Prayer', mode: 'eidFitr' },
  { id: 'eidAdha', name: 'Eid-ul-Aḍḥā Prayer', mode: 'eidAdha' },
  { id: 'qiyam', name: 'Qiyām-ul-Layl', mode: 'qiyam' },
  { id: 'lateIsha', name: 'Late Ishā', mode: 'lateIsha' }
];

// --- SUB-COMPONENTS ---
const FAQItem = ({ q, a }) => {
    const [isOpen, setIsOpen] = useState(false);
    return (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 overflow-hidden shadow-sm">
            <button onClick={() => setIsOpen(!isOpen)} className="w-full flex items-center justify-between p-4 text-left">
                <span className="text-xs font-bold text-gray-700 dark:text-gray-200">{q}</span>
                <i className={`fas fa-chevron-down text-[10px] text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}></i>
            </button>
            {isOpen && <div className="px-4 pb-4 text-xs text-gray-500 dark:text-gray-400 leading-relaxed border-t border-gray-50 dark:border-gray-700 pt-3" dangerouslySetInnerHTML={{__html: a}}></div>}
        </div>
    );
};

export default function App() {
  // --- STATE DECLARATIONS ---
  const [installPrompt, setInstallPrompt] = useState(null);
  const [viewMode, setViewMode] = useState('next');
  const [currentList, setCurrentList] = useState('Nearby'); // Nearby is now the default
  const [searchQuery, setSearchQuery] = useState('');
  const [mosques, setMosques] = useState([]);
  
  // New Location & Map State
  const [userLocation, setUserLocation] = useState(() => {
    try {
      const saved = localStorage.getItem('userLocation');
      return saved ? JSON.parse(saved) : null;
    } catch (e) {
      return null;
    }
  });
  const [locStatus, setLocStatus] = useState(() => localStorage.getItem('userLocation') ? 'granted' : 'prompt');
  const [mapExpanded, setMapExpanded] = useState(false);
  const [sortByNext, setSortByNext] = useState('time'); 
  const [sortByList, setSortByList] = useState('distance'); 
  const [visibleLimit, setVisibleLimit] = useState(20);
  
  const [searchCenter, setSearchCenter] = useState(null);
  const [mapCameraCenter, setMapCameraCenter] = useState(null);
  const [recenterTrigger, setRecenterTrigger] = useState(null);

  const [appSettings, setAppSettings] = useState({
    ramadan: false, eidFitr: false, eidAdha: false, qiyam: false, lateIsha: false,
    theme: localStorage.getItem('theme') || 'light',
    city: localStorage.getItem('city') || 'Locating...'
  });

  const [currentUser, setCurrentUser] = useState(null);
  const [userRole, setUserRole] = useState('public');
  const [availableCities, setAvailableCities] = useState(new Set(['Hyderabad']));
  const [personalLists, setPersonalLists] = useState({ Favorites: [], Home: [], Work: [] });
  const [customOrder, setCustomOrder] = useState([]);
  
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [currentTimeDisplay, setCurrentTimeDisplay] = useState('--:-- AM');
  const [currentTargetPrayer, setCurrentTargetPrayer] = useState('fajr');
  const [isFriday, setIsFriday] = useState(false);
  const [activeModal, setActiveModal] = useState(null); 
  const [selectedMosqueId, setSelectedMosqueId] = useState(null);
  
  const [toastVisible, setToastVisible] = useState(false);
  const [toastMessage, setToastMessage] = useState('Saved');

  const [mosqueFormData, setMosqueFormData] = useState({ name: 'Masjid-e-', area: '', locationLink: '', address: '' });
  const [timingFormData, setTimingFormData] = useState({});
  const [newCityInput, setNewCityInput] = useState('');
  const [newListInput, setNewListInput] = useState('');
  const [contactForm, setContactForm] = useState({ name: '', email: '', message: '', honeypot: '' });
  const [editingList, setEditingList] = useState(null);
  const [editListInput, setEditListInput] = useState('');

  // --- LOCATION ENGINE ---
  const requestLocation = () => {
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const coords = { lat: position.coords.latitude, lng: position.coords.longitude };
          setUserLocation(coords);
          setLocStatus('granted');
          localStorage.setItem('userLocation', JSON.stringify(coords));
          
          // Reverse Geocode for Dynamic City
          try {
            const res = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?latlng=${coords.lat},${coords.lng}&key=${GOOGLE_MAPS_API_KEY}`);
            const data = await res.json();
            if (data.results && data.results.length > 0) {
              const addressComponents = data.results[0].address_components;
              const cityComp = addressComponents.find(c => c.types.includes("locality"));
              if (cityComp) {
                const formattedCity = cityComp.long_name;
                setAppSettings(prev => ({ ...prev, city: formattedCity }));
                localStorage.setItem('city', formattedCity);
                setAvailableCities(prev => new Set([formattedCity, ...prev]));
              }
            }
          } catch (e) { console.error("Reverse geocoding failed", e); }
        },
        () => { 
            setLocStatus('denied'); 
            if(currentList === 'Nearby') setCurrentList('All'); 
        }
      );
    }
  };

  const getDistance = (lat1, lon1, lat2, lon2) => {
    if(!lat1 || !lon1 || !lat2 || !lon2) return Infinity;
    const R = 6371; 
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c; 
  };

  // --- EFFECTS ---
  useEffect(() => { requestLocation(); }, []);

  useEffect(() => {
    const handler = (e) => { 
        // Allowing default behavior so the native browser popup/infobar can appear on open
        setInstallPrompt(e); 
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstallClick = async () => {
      if (!installPrompt) return;
      try {
          await installPrompt.prompt();
          const { outcome } = await installPrompt.userChoice;
          if (outcome === 'accepted') {
              setInstallPrompt(null);
          }
      } catch (err) {
          console.error("Install prompt error:", err);
      }
  };

  useEffect(() => {
    const localLists = localStorage.getItem('personalLists');
    const localOrder = localStorage.getItem('customOrder');
    
    if (localLists) {
        const parsed = JSON.parse(localLists);
        setPersonalLists(parsed);
    }
    if (localOrder) setCustomOrder(JSON.parse(localOrder));

    document.documentElement.classList.toggle('dark', appSettings.theme === 'dark');

    const unsubAuth = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      if (user) {
        const userDocRef = doc(db, 'users', user.uid);
        onSnapshot(userDocRef, (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                setUserRole(data.role || 'user');
                if (data.personalLists) setPersonalLists(data.personalLists);
                if (data.customOrder) setCustomOrder(data.customOrder);
            } else {
                setUserRole('user');
                setDoc(userDocRef, { email: user.email, name: user.displayName, role: 'user', personalLists, customOrder, createdAt: new Date().toISOString() });
            }
        });
      } else setUserRole('public');
    });

    const unsubSettings = onSnapshot(doc(db, 'settings', 'global_modes'), (docSnap) => {
        if (docSnap.exists()) setAppSettings(prev => ({ ...prev, ...docSnap.data() }));
    });
    
    const unsubLocations = onSnapshot(doc(db, 'settings', 'locations'), (docSnap) => {
        if (docSnap.exists() && docSnap.data().cities) {
            setAvailableCities(prev => new Set(['Hyderabad', ...docSnap.data().cities]));
        }
    });

    const unsubMosques = onSnapshot(collection(db, 'mosques'), (snap) => {
        setMosques(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    return () => { unsubAuth(); unsubSettings(); unsubLocations(); unsubMosques(); };
  }, []);

  useEffect(() => {
    const updateClock = () => {
        const now = new Date();
        let hours = now.getHours();
        const minutes = String(now.getMinutes()).padStart(2, '0');
        const ampm = hours >= 12 ? 'PM' : 'AM';
        hours = hours % 12 || 12;
        
        setCurrentTimeDisplay(`${hours}:${minutes} <span class="text-lg font-bold opacity-60 font-sans">${ampm}</span>`);
        
        const min = now.getHours() * 60 + now.getMinutes();
        const friday = now.getDay() === 5;
        setIsFriday(friday);

        if (min >= 1350 || min < 405) setCurrentTargetPrayer('fajr');
        else if (min >= 405 && min < 930) setCurrentTargetPrayer(friday ? 'jumma' : 'zuhr');
        else if (min >= 930 && min < 1065) setCurrentTargetPrayer('asr');
        else setCurrentTargetPrayer('isha');
    };
    updateClock();
    const timer = setInterval(updateClock, 1000);
    return () => clearInterval(timer);
  }, []);

  // --- HELPER FUNCTIONS ---
  const formatTime12 = (time24, pid = null) => { 
      if (!time24 || time24.trim() === '') return '--:--';
      if (pid === 'taraweeh') return `${time24} <span class="text-[9px] uppercase font-sans font-bold text-gray-400">Pārahs</span>`;
      const [h, m] = time24.split(':');
      let hours = parseInt(h); 
      const suffix = hours >= 12 ? 'PM' : 'AM'; 
      hours = hours % 12 || 12; 
      return `${hours}:${String(m).padStart(2,'0')}<span class="text-[10px] ml-0.5 font-sans font-normal text-gray-400">${suffix}</span>`; 
  };

  const getRelativeTime = (iso) => {
    if(!iso) return '';
    const updatedDate = new Date(iso);
    const now = new Date();
    
    // Normalize both to the start of the day to compare dates accurately
    const updatedDay = new Date(updatedDate.getFullYear(), updatedDate.getMonth(), updatedDate.getDate());
    const nowDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    const diffTime = nowDay - updatedDay;
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return 'Today';
    return `${diffDays}d ago`;
  };

  const isTimingPredicted = (iso) => {
      return false; // Stale timing concept removed as requested
  };

  const getTimeRemaining = (timeStr, pid = null) => {
      if(!timeStr || pid === 'eidFitr' || pid === 'eidAdha') return '';
      const now = new Date(); const [h, m] = timeStr.split(':').map(Number);
      const target = new Date(); target.setHours(h, m, 0, 0);
      if (pid === 'fajr' && now.getHours() > 20) target.setDate(target.getDate() + 1);
      if (target < now) return '(Time Passed)';
      const diff = target - now; const hrs = Math.floor(diff / 3600000); const mins = Math.floor((diff % 3600000) / 60000);
      return hrs > 0 ? `${hrs}h ${mins}m left` : `${mins}m left`;
  };

  const showToastMsg = (msg = 'Saved') => {
      setToastMessage(msg); setToastVisible(true);
      setTimeout(() => setToastVisible(false), 2000);
  };

  const handleModalClickOutside = (e, modalName) => {
      if (e.target === e.currentTarget) setActiveModal(null);
  };

  const saveUserData = (newLists, newOrder) => {
      localStorage.setItem('personalLists', JSON.stringify(newLists));
      if (newOrder) localStorage.setItem('customOrder', JSON.stringify(newOrder));
      if (currentUser) {
          const userRef = doc(db, 'users', currentUser.uid);
          updateDoc(userRef, { personalLists: newLists, customOrder: newOrder || customOrder }).catch(err => console.error(err));
      }
  };

  const tryAction = (type, callback) => {
      if (type === 'edit' && (userRole === 'volunteer' || userRole === 'admin')) return callback();
      if (type === 'admin' && userRole === 'admin') return callback();
      setActiveModal('accessDenied');
  };

  const toggleTheme = () => {
      const isDark = appSettings.theme === 'light';
      document.documentElement.classList.toggle('dark', isDark);
      setAppSettings(prev => ({ ...prev, theme: isDark ? 'dark' : 'light' }));
      localStorage.setItem('theme', isDark ? 'dark' : 'light');
  };

  const toggleMode = async (key) => {
      if(userRole !== 'admin') return tryAction('admin', ()=>{});
      const newVal = !appSettings[key];
      setAppSettings(prev => ({ ...prev, [key]: newVal }));
      await setDoc(doc(db, 'settings', 'global_modes'), { [key]: newVal }, { merge: true });
  };

  // --- LIST MANAGEMENT ---
  const togglePersonalList = (listName, id) => {
      const newLists = { ...personalLists };
      if (newLists[listName].includes(id)) newLists[listName] = newLists[listName].filter(x => x !== id);
      else newLists[listName].push(id);
      setPersonalLists(newLists); saveUserData(newLists);
  };

  const createNewPersonalList = () => {
      const name = newListInput.trim();
      if (name && !personalLists[name]) {
          const newLists = { ...personalLists, [name]: [] };
          setPersonalLists(newLists); saveUserData(newLists); setNewListInput('');
      }
  };

  const deletePersonalList = (listName) => {
      const DEFAULT_LISTS = ['Favorites', 'Home', 'Work'];
      if (DEFAULT_LISTS.includes(listName)) return;
      if (window.confirm(`Are you sure you want to delete "${listName}"?`)) {
          const newLists = { ...personalLists };
          delete newLists[listName]; 
          setPersonalLists(newLists);
          saveUserData(newLists); 
          if (currentList === listName) setCurrentList('All');
          showToastMsg('List Deleted');
      }
  };

  const renamePersonalList = (oldName) => {
      const DEFAULT_LISTS = ['Favorites', 'Home', 'Work'];
      const newName = editListInput.trim();
      if (!newName || newName === oldName || personalLists[newName] || DEFAULT_LISTS.includes(oldName)) {
          setEditingList(null); return;
      }
      const newLists = { ...personalLists };
      newLists[newName] = newLists[oldName]; 
      delete newLists[oldName];
      setPersonalLists(newLists); saveUserData(newLists); setEditingList(null);
      if (currentList === oldName) setCurrentList(newName);
  };

  const movePersonalOrder = (id, dir) => {
      let currentOrder = [...customOrder];
      if (!currentOrder.includes(id)) currentOrder = mosques.map(m => m.id);
      const idx = currentOrder.indexOf(id);
      const targetIdx = idx + dir;
      if (targetIdx >= 0 && targetIdx < currentOrder.length) {
          const temp = currentOrder[idx];
          currentOrder[idx] = currentOrder[targetIdx]; currentOrder[targetIdx] = temp;
          setCustomOrder(currentOrder); saveUserData(personalLists, currentOrder);
      }
  };

  const addNewCity = async () => {
      if (userRole !== 'volunteer' && userRole !== 'admin') return tryAction('admin', () => {});
      const val = newCityInput.trim();
      if(val) {
          const formatted = val.charAt(0).toUpperCase() + val.slice(1).toLowerCase();
          await setDoc(doc(db, 'settings', 'locations'), { cities: arrayUnion(formatted) }, { merge: true });
          setAvailableCities(prev => new Set([...prev, formatted]));
          setAppSettings(prev => ({ ...prev, city: formatted })); localStorage.setItem('city', formatted);
          setActiveModal(null); setNewCityInput('');
      }
  };

  // --- API / DB ACTIONS ---
  const saveMosqueInfo = async (goToTimings = false) => {
      if (userRole !== 'volunteer' && userRole !== 'admin') return;
      if(!mosqueFormData.name) return alert("Name required");

      let extractedCoords = null;
      if (mosqueFormData.locationLink) {
          try {
              const { data } = await extractLocationCall({ url: mosqueFormData.locationLink });
              if (data.lat && data.lng) extractedCoords = { lat: data.lat, lng: data.lng };
          } catch (e) {
              console.error("Failed to extract location", e);
          }
      }

      const data = { ...mosqueFormData, city: appSettings.city };
      if (extractedCoords) data.coordinates = extractedCoords;

      let savedId = selectedMosqueId; 
      let defaultDbTimings = null;

      if (selectedMosqueId) {
          await updateDoc(doc(db, 'mosques', selectedMosqueId), data);
      } else { 
          data.order = Date.now();
          const nowISO = new Date().toISOString();
          defaultDbTimings = {
              fajr: { time: "05:15", fixed: false, lastUpdated: nowISO },
              zuhr: { time: "13:30", fixed: true, lastUpdated: nowISO },
              asr: { time: "17:15", fixed: false, lastUpdated: nowISO },
              isha: { time: "20:30", fixed: false, lastUpdated: nowISO },
              jumma: { time: "13:30", fixed: true, lastUpdated: nowISO }
          };
          data.timings = defaultDbTimings;
          data.history = [];
          const ref = await addDoc(collection(db, 'mosques'), data); 
          savedId = ref.id;
      }
      showToastMsg(); 
      if (goToTimings) openEditTiming(savedId, defaultDbTimings);
      else setActiveModal(null);
  };

  const saveTimings = async () => {
      if (userRole !== 'volunteer' && userRole !== 'admin') return;
      const m = mosques.find(x => x.id === selectedMosqueId);
      if (!m) return; 

      let updatedTimings = { ...m.timings };
      let updatedHistory = m.history ? [...m.history] : [];
      const nowISO = new Date().toISOString();

      [...prayersList, ...specialPrayersList].forEach(p => { 
          const formData = timingFormData[p.id];
          if (formData && formData.time) {
              const finalDate = formData.date ? new Date(formData.date).toISOString() : nowISO;
              
              if (updatedTimings[p.id] && updatedTimings[p.id].time !== formData.time) {
                  updatedHistory.push({ prayer: p.id, time: updatedTimings[p.id].time, replacedAt: nowISO });
              }

              updatedTimings[p.id] = { 
                  time: formData.time, fixed: formData.fixed || false, lastUpdated: formData.fixed ? null : finalDate
              }; 
          } else if (formData && formData.time === '') {
              delete updatedTimings[p.id];
          }
      });

      await updateDoc(doc(db, 'mosques', selectedMosqueId), { timings: updatedTimings, history: updatedHistory }); 
      setActiveModal(null); 
      showToastMsg('Saved');
  };

  const deleteMosque = async () => { 
      if(window.confirm("Delete this masjid?")) { await deleteDoc(doc(db, 'mosques', selectedMosqueId));
      setActiveModal(null); showToastMsg('Deleted'); } 
  };

  const submitContactForm = async () => {
      if (contactForm.honeypot) return;
      if (!contactForm.message) return alert("Please enter a message.");
      try {
          await addDoc(collection(db, 'contact_messages'), { name: contactForm.name || 'Anonymous', email: contactForm.email || 'Not provided', message: contactForm.message, timestamp: serverTimestamp(), source: 'React Web App' });
          setActiveModal(null); setContactForm({ name: '', email: '', message: '', honeypot: '' }); showToastMsg("Message sent ✓");
      } catch (e) { alert("Error sending message."); }
  };

  const openMosqueModal = (id = null) => {
      setSelectedMosqueId(id);
      if (id) {
          const m = mosques.find(x => x.id === id);
          if (m) setMosqueFormData({ name: m.name, area: m.area, locationLink: m.locationLink || '', address: m.address || '' });
      } else setMosqueFormData({ name: 'Masjid-e-', area: '', locationLink: '', address: '' });
      setActiveModal('info');
  };

  const openEditTiming = (id, freshTimings = null) => {
      setSelectedMosqueId(id);
      const m = mosques.find(x => x.id === id);
      const DEFAULT_PRAYER_TIMES = { fajr: "05:15", zuhr: "13:30", asr: "17:15", isha: "20:30", jumma: "13:30" };
      const initTimings = {};
      const today = new Date().toISOString().split('T')[0];
      const sourceTimings = freshTimings || m?.timings || {};

      [...prayersList, ...specialPrayersList].forEach(p => {
          const existingTime = sourceTimings[p.id]?.time;
          const isFixed = sourceTimings[p.id]?.fixed || false;
          const lastUpdated = sourceTimings[p.id]?.lastUpdated ? sourceTimings[p.id].lastUpdated.split('T')[0] : today;
          initTimings[p.id] = { time: existingTime || DEFAULT_PRAYER_TIMES[p.id] || '', fixed: isFixed, date: lastUpdated };
      });
      setTimingFormData(initTimings);
      setActiveModal('timing');
  };

  const adjustTimingFormTime = (key, mins) => {
      setTimingFormData(prev => {
          const current = prev[key] || { time: '', fixed: false, date: '' };
          if (!current.time) return prev;
          const [h, m] = current.time.split(':').map(Number);
          const d = new Date(); d.setHours(h, m + mins);
          return { ...prev, [key]: { ...current, time: `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}` } };
      });
  };

  // --- CENTRALIZED FILTERING & SORTING ENGINE ---
  const activeMosques = useMemo(() => {
      let filtered = mosques.filter(m => (m.city || 'Hyderabad') === appSettings.city);

      filtered = filtered.map(m => {
          const activeCalcCenter = searchCenter || userLocation;
          if (activeCalcCenter && m.coordinates) {
              const d = getDistance(activeCalcCenter.lat, activeCalcCenter.lng, m.coordinates.lat, m.coordinates.lng);
              return { ...m, distance: d };
          }
          return { ...m, distance: Infinity };
      });

      if (currentList === 'Jummah') filtered = filtered.filter(m => m.timings?.jumma?.time);
      else if (currentList === 'Nearby') filtered = filtered.filter(m => m.distance !== undefined && m.distance <= 4);
      else if (currentList !== 'All') { 
          const list = personalLists[currentList] || []; 
          filtered = filtered.filter(m => list.includes(m.id)); 
      }

      if (searchQuery) { 
          const lowerQ = searchQuery.toLowerCase();
          filtered = filtered.filter(m => m.name.toLowerCase().includes(lowerQ) || m.area.toLowerCase().includes(lowerQ)); 
      }

      filtered.sort((a, b) => {
          const activeSort = viewMode === 'next' ? sortByNext : sortByList;
          if (activeSort === 'distance') return (a.distance || 0) - (b.distance || 0);
          if (activeSort === 'recent') {
             const timeA = Math.max(...Object.values(a.timings || {}).map(t => new Date(t.lastUpdated || 0).getTime()));
             const timeB = Math.max(...Object.values(b.timings || {}).map(t => new Date(t.lastUpdated || 0).getTime()));
             return timeB - timeA;
          }

          const idxA = customOrder.indexOf(a.id); const idxB = customOrder.indexOf(b.id);
          if (idxA === -1 && idxB === -1) return (b.order || 0) - (a.order || 0);
          if (idxA === -1) return 1; if (idxB === -1) return -1; return idxA - idxB;
      });

      return filtered.slice(0, currentList === 'Jummah' ? visibleLimit * 2 : visibleLimit);
  }, [mosques, appSettings.city, currentList, searchQuery, customOrder, searchCenter, userLocation, sortByNext, sortByList, visibleLimit, viewMode, currentTargetPrayer, personalLists]);

  const selectedMosqueDetail = mosques.find(m => m.id === selectedMosqueId);
  
  // --- RENDER HELPERS ---
  const renderNextPrayerMode = () => {
      const shouldSortByTimeLocally = (currentList !== 'Nearby') || (currentList === 'Nearby' && sortByNext === 'time');

      const getSortedSublist = (mosquesArr, pid) => {
          let list = mosquesArr.filter(m => m.timings?.[pid]?.time);
          if (shouldSortByTimeLocally) {
              list = [...list].sort((a,b) => a.timings[pid].time.localeCompare(b.timings[pid].time));
          }
          return list;
      };

      if (currentList === 'Jummah') {
          const jummaList = getSortedSublist(activeMosques, 'jumma');
          if (!jummaList.length) return <div className="text-center mt-10 text-gray-400 text-xs font-bold uppercase tracking-widest">No Jummah timings found.</div>;
          return (
              <div className="pb-10">
                  <div className="mt-2 mb-2 flex items-center justify-between px-1">
                      <div className="flex items-center gap-2"><i className="fas fa-users text-xs text-emerald-600"></i><h3 className="text-xs font-sans font-bold text-emerald-700 dark:text-emerald-400 uppercase tracking-widest">Jummah Timings</h3></div>
                  </div>
                  {jummaList.map(m => {
                      const t = m.timings.jumma.time; const [h, mins] = t.split(':');
                      return (
                          <div key={m.id} onClick={() => { setSelectedMosqueId(m.id); setActiveModal('detail'); }} className="flex justify-between items-center bg-white dark:bg-gray-800 px-4 py-2.5 rounded-xl shadow-sm border-l-[3px] border-emerald-600 mb-2 animate-card cursor-pointer">
                              <div className="flex-1 mr-4 flex items-center gap-3">
                                  <i className="fas fa-mosque text-sm text-emerald-500/30"></i>
                                  <div>
                                      <h4 className="font-sans font-bold text-sm dark:text-white leading-tight">{m.name}</h4>
                                      <p className="font-bold text-[10px] text-gray-500 font-medium font-sans flex items-center gap-2 mt-0.5">
                                          {m.area}
                                          {m.distance && m.distance !== Infinity && <span className="text-[9px] bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 px-1 py-0.5 rounded">{m.distance.toFixed(1)} km</span>}
                                      </p>
                                  </div>
                              </div>
                              <div className="text-right font-anonymous font-bold text-xl text-emerald-700 dark:text-emerald-400">{parseInt(h)%12||12}:{mins}<span className="text-[9px] ml-1 font-sans font-normal">{h>=12?'PM':'AM'}</span></div>
                          </div>
                      );
                  })}
                  {visibleLimit < mosques.length && (
                      <button onClick={() => setVisibleLimit(prev => prev + 20)} className="w-full py-2 mt-2 bg-gray-100 dark:bg-gray-800 text-gray-500 text-[10px] font-bold uppercase rounded-xl">Load More</button>
                  )}
              </div>
          );
      }

      let startKey = currentTargetPrayer === 'jumma' ? 'zuhr' : currentTargetPrayer; 
      let idx = sequenceOrder.indexOf(startKey);
      let sequence = []; 
      for(let i=0; i<4; i++) { 
          let pid = sequenceOrder[(idx + i) % 4];
          if (pid === 'zuhr' && isFriday) pid = 'jumma'; 
          sequence.push(pid);
      }

      if (!activeMosques.length) return <div className="text-center mt-10 text-gray-400 text-xs font-bold uppercase tracking-widest">No Masājid found.</div>;

      return (
          <div className="pb-10">
              {/* Special Eid Prayers Block */}
              {['eidFitr', 'eidAdha'].map(eidKey => {
                  if(!appSettings[eidKey]) return null;
                  const sublist = getSortedSublist(activeMosques, eidKey);
                  if(!sublist.length) return null;
                  return (
                      <div key={eidKey}>
                          <div className="mt-4 mb-2 flex items-center gap-2 px-1"><i className="fas fa-star text-xs text-amber-500"></i><h3 className="text-xs font-sans font-bold text-amber-600 uppercase tracking-widest">{specialPrayersList.find(s=>s.id===eidKey).name}</h3></div>
                          {sublist.map(m => {
                              const [h, mins] = m.timings[eidKey].time.split(':');
                              return (
                                  <div key={m.id} onClick={() => { setSelectedMosqueId(m.id); setActiveModal('detail'); }} className="flex justify-between items-center bg-white dark:bg-gray-800 px-4 py-2.5 rounded-xl shadow-sm border-l-[3px] border-amber-500 mb-2 animate-card cursor-pointer">
                                      <div className="flex-1 mr-4 flex items-center gap-3">
                                          <i className="fas fa-mosque text-sm text-amber-400"></i>
                                          <div>
                                              <h4 className="font-sans font-bold text-sm dark:text-white leading-tight">{m.name}</h4>
                                              <p className="font-bold text-[10px] text-gray-500 font-medium font-sans flex items-center gap-2 mt-0.5">
                                                  {m.area}
                                                  {m.distance && m.distance !== Infinity && <span className="text-[9px] bg-amber-50 dark:bg-amber-900/30 text-amber-600 px-1 py-0.5 rounded">{m.distance.toFixed(1)} km</span>}
                                              </p>
                                          </div>
                                      </div>
                                      <div className="text-right font-anonymous font-bold text-xl dark:text-white">{parseInt(h)%12||12}:{mins}<span className="text-[9px] ml-1 font-sans font-normal">{h>=12?'PM':'AM'}</span></div>
                                  </div>
                              );
                          })}
                      </div>
                  );
              })}

              {/* Main 4 Prayers Sequence Block */}
              {sequence.map((pid, seqIdx) => {
                  const sublist = getSortedSublist(activeMosques, pid);
                  if(!sublist.length) return null;
                  const pObj = prayersList.find(p=>p.id===pid);
                  return (
                      <div key={pid}>
                          <div className={`${seqIdx === 0 ? 'mt-1' : 'mt-6'} mb-2 flex items-center justify-between px-2 sticky top-0 py-2 z-10 backdrop-blur-md bg-white/90 dark:bg-gray-900/90 shadow-[0_4px_10px_rgba(0,0,0,0.03)] border-b border-gray-100 dark:border-gray-800 rounded-lg`} dir="ltr">
                              <div className="flex items-center pointer-events-none">
                                  <i className={`fas ${pObj.icon} text-xs ${seqIdx === 0 ? "text-brand-500" : "text-gray-400"}`}></i>
                                  <h3 className={`ml-2 text-xs font-sans font-bold uppercase tracking-widest ${seqIdx === 0 ? "text-brand-600 dark:text-brand-400" : "text-gray-400"}`}>{pObj.name}</h3>
                                  <span className={`mx-2 h-4 w-px ${seqIdx === 0 ? "bg-brand-400 dark:bg-brand-500" : "bg-gray-300 dark:bg-gray-600"}`}></span>
                                  <span className={`font-arabic text-md ${seqIdx === 0 ? "text-brand-600 dark:text-brand-400" : "text-gray-400"}`} dir="rtl">{pObj.arabic}</span>
                              </div>
                              {seqIdx === 0 && currentList === 'Nearby' && (
                                  <button onClick={() => setSortByNext(prev => prev === 'time' ? 'distance' : 'time')} className="pointer-events-auto text-[10px] font-bold text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-700 bg-gray-100 dark:bg-gray-800 px-2.5 py-1 rounded-xl transition-all shadow-sm border border-gray-200 dark:border-gray-700">
                                      Sort by {sortByNext === 'time' ? 'Distance' : 'Time'} <i className="fas fa-sort ml-1 opacity-70"></i>
                                  </button>
                              )}
                          </div>

                          {sublist.map(m => {
                              const t = m.timings[pid]; 
                              const [h, mins] = t.time.split(':'); 
                              const rem = seqIdx === 0 ? getTimeRemaining(t.time, pid) : ''; 
                              const passed = rem === '(Time Passed)';
                              const predicted = isTimingPredicted(t.lastUpdated) && !t.fixed;
                              const taraweehData = (pid === 'isha' && appSettings.ramadan && m.timings['taraweeh']?.time) ? m.timings['taraweeh'].time : null;

                              return (
                                  <div key={m.id} onClick={() => { setSelectedMosqueId(m.id); setActiveModal('detail'); }} className={`cursor-pointer flex justify-between items-center bg-white dark:bg-gray-800 px-4 py-2.5 rounded-xl shadow-sm border-l-[3px] ${seqIdx===0?(passed?'border-gray-300 opacity-60':'border-brand-500'):'border-gray-200 dark:border-gray-700 opacity-80'} mb-2 transition-all`}>
                                      <div className="flex-1 flex items-center gap-3">
                                          <i className="fas fa-mosque text-sm text-gray-400"></i>
                                          <div>
                                              <h4 className="font-sans font-bold text-sm dark:text-white leading-tight">{m.name}</h4>
                                              <p className="font-bold text-[10px] text-gray-500 font-medium font-sans flex items-center gap-2 mt-0.5">
                                                  {m.area}
                                                  {m.distance && m.distance !== Infinity && <span className="text-[9px] bg-brand-50 dark:bg-brand-900/30 text-brand-600 px-1 py-0.5 rounded">{m.distance.toFixed(1)} km</span>}
                                              </p>
                                              {taraweehData && <span className="inline-block mt-1 text-[8px] font-bold text-amber-800 dark:text-amber-100 px-1.5 py-0.5 rounded bg-amber-400 dark:bg-amber-600 shadow-sm uppercase font-sans">Tarāweeḥ: <span className="font-anonymous">{taraweehData}</span> P</span>}
                                          </div>
                                      </div>
                                      <div className="text-right flex flex-col items-end leading-none tabular-nums">
                                          <div className="font-anonymous font-bold text-xl text-gray-900 dark:text-white tracking-tight relative">
                                              {parseInt(h) % 12 || 12}:{mins}
                                              <span className="text-[9px] ml-1 font-sans font-medium text-gray-500">{h >= 12 ? 'PM' : 'AM'}</span>
                                              {predicted && <span className="text-amber-500 absolute -top-1 -right-2 text-[10px]" title="Predicted Timing">*</span>}
                                          </div>
                                          {t.lastUpdated && !t.fixed && (
                                              <div className="w-full text-right font-ptsans text-[9px] text-gray-400 dark:text-gray-500 mt-1">
                                                  {getRelativeTime(t.lastUpdated)}
                                              </div>
                                          )}
                                          {seqIdx === 0 && (
                                              <div className={`mt-1 text-[9px] font-semibold font-sans px-2 py-0.5 rounded-md ${passed ? 'text-gray-400 bg-gray-100 dark:bg-gray-700' : 'text-brand-700 bg-brand-100 dark:bg-brand-900/40'}`}>
                                                  {rem}
                                              </div>
                                          )}
                                      </div>
                                  </div>
                              );
                          })}
                      </div>
                  );
              })}

              {visibleLimit < mosques.length && (
                  <button onClick={() => setVisibleLimit(prev => prev + 20)} className="w-full py-2 mt-2 bg-gray-100 dark:bg-gray-800 text-gray-500 text-[10px] font-bold uppercase rounded-xl">Load More</button>
              )}
          </div>
      );
  };

  const renderListMode = () => {
      if(!activeMosques.length) return <div className="text-center mt-10 text-gray-400 text-xs font-bold uppercase tracking-widest">No Masājid found.</div>;
      return (
          <div className="pb-10 space-y-3">
              <div className="flex justify-end mb-2">
                  <select value={sortByList} onChange={(e) => setSortByList(e.target.value)} className="text-[10px] font-bold text-gray-500 bg-gray-100 dark:bg-gray-800 border-none outline-none px-2 py-1 rounded cursor-pointer">
                      <option value="distance">Sort by Distance</option>
                      <option value="time">Sort by Time (Ascending)</option>
                      <option value="recent">Recently Updated</option>
                      <option value="custom">Custom Order</option>
                  </select>
              </div>
              {activeMosques.map(m => {
                  let specHTML = [];
                  specialPrayersList.forEach(sp => { 
                      if(sp.id === 'taraweeh') return;
                      if(appSettings[sp.mode] === true && m.timings && m.timings[sp.id]?.time) 
                          specHTML.push(<div key={sp.id} className="flex justify-between px-2 py-1 bg-amber-50 dark:bg-amber-900/10 rounded mb-1 text-[9px] font-bold font-sans"><span className="text-amber-700">{sp.name}</span><span className="text-amber-800 dark:text-white font-anonymous text-xs" dangerouslySetInnerHTML={{__html: formatTime12(m.timings[sp.id].time, sp.id)}}></span></div>); 
                  });
                  const hasLink = m.locationLink && m.locationLink.trim() !== '';

                  return (
                      <div key={m.id} className="bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-sm border-l-[3px] border-r-[3px] border-l-brand-500 border-r-gray-100 dark:border-r-gray-700 mb-3 animate-card">
                          <div className="flex justify-between items-start mb-3">
                              <div className="cursor-pointer flex items-start gap-3" onClick={() => { setSelectedMosqueId(m.id); setActiveModal('detail'); }}>
                                  <i className="fas fa-mosque text-brand-500 mt-1"></i>
                                  <div>
                                      <h2 className="font-sans font-bold text-sm text-gray-800 dark:text-white leading-tight">{m.name}</h2>
                                      <p className="font-bold text-[10px] text-gray-400 font-medium font-sans flex items-center gap-2 mt-0.5">
                                          {m.area}
                                          {m.distance && m.distance !== Infinity && <span className="bg-gray-100 dark:bg-gray-700 px-1 py-0.5 rounded text-gray-500">{m.distance.toFixed(1)} km</span>}
                                      </p>
                                  </div>
                              </div>
                              <div className="flex items-center gap-1 bg-gray-50 dark:bg-gray-700/50 rounded-lg p-1">
                                  {sortByList === 'custom' && (
                                      <>
                                          <button onClick={() => movePersonalOrder(m.id, -1)} className="w-6 h-6 rounded flex items-center justify-center text-xs text-gray-400"><i className="fas fa-chevron-up"></i></button>
                                          <button onClick={() => movePersonalOrder(m.id, 1)} className="w-6 h-6 rounded flex items-center justify-center text-xs text-gray-400"><i className="fas fa-chevron-down"></i></button>
                                          <div className="w-px h-3 bg-gray-200 dark:bg-gray-600 mx-1"></div>
                                      </>
                                  )}
                                  <button onClick={() => { setSelectedMosqueId(m.id); setActiveModal('personalList'); }} className="w-6 h-6 rounded flex items-center justify-center text-xs text-red-800"><i className="fas fa-heart"></i></button>
                                  {(userRole==='admin'||userRole==='volunteer') && <button onClick={() => openMosqueModal(m.id)} className="w-6 h-6 text-brand-600 rounded flex items-center justify-center ml-1"><i className="fas fa-pencil-alt text-xs"></i></button>}
                              </div>
                          </div>
                          
                          <div className="grid grid-cols-5 gap-0.5 text-center border-t border-gray-50 dark:border-gray-700 pt-3 mb-3">
                              {prayersList.map(p => {
                                  const t = m.timings?.[p.id]?.time; 
                                  if(!t) return <div key={p.id} onClick={() => tryAction('edit',()=>openEditTiming(m.id))} className="opacity-30 cursor-pointer"><div className="font-sans text-[8px] font-bold text-brand-500/80 mb-1 flex flex-col items-center gap-0.5 uppercase"><i className={`fas ${p.icon} text-[10px]`}></i> {p.name.slice(0,5)}</div>-</div>;
                                  
                                  const [h, mins] = t.split(':');
                                  const taraweehData = (p.id === 'isha' && appSettings.ramadan && m.timings['taraweeh']?.time) ? m.timings['taraweeh'].time : null;
                                  const predicted = isTimingPredicted(m.timings[p.id].lastUpdated) && !m.timings[p.id].fixed;

                                  return (
                                      <div key={p.id} onClick={() => tryAction('edit',()=>openEditTiming(m.id))} className="cursor-pointer py-1 relative">
                                          <div className="text-[8px] font-bold font-sans text-brand-500/80 mb-1 flex flex-col items-center gap-0.5 uppercase"><i className={`fas ${p.icon} text-[10px]`}></i> {p.name.slice(0,5)}</div>
                                          <div className="font-anonymous text-sm font-bold dark:text-white">
                                              {parseInt(h)%12||12}:{mins}
                                              <span className="text-[7px] block font-sans font-normal">{h>=12?'PM':'AM'}</span>
                                          </div>
                                          {predicted && <span className="text-amber-500 absolute top-0 right-0 text-[8px]">*</span>}
                                          {m.timings[p.id].lastUpdated && !m.timings[p.id].fixed && <div className="font-ptsans font-bold text-[8px] text-gray-400 mt-0.5">{getRelativeTime(m.timings[p.id].lastUpdated)}</div>}
                                          {taraweehData && <div className="mx-auto mt-1 px-1 py-0.5 rounded bg-amber-400 dark:bg-amber-600 text-[6px] font-bold font-sans text-amber-900 dark:text-amber-50 w-fit"><span className="font-anonymous">{taraweehData}</span>P</div>}
                                      </div>
                                  );
                              })}
                          </div>
                          <div>{specHTML}</div>
                          
                          <div className="flex border-t border-gray-100 dark:border-gray-700 pt-2">
                              <button onClick={(e) => { e.currentTarget.parentElement.nextSibling.classList.toggle('hidden'); }} className="flex-1 text-[10px] font-bold text-gray-400 uppercase font-sans">Notes <i className="fas fa-chevron-down"></i></button>
                              {hasLink ? <a href={m.locationLink} target="_blank" rel="noreferrer" className="flex-1 text-[10px] font-bold font-sans text-brand-600 text-center uppercase">Maps <i className="fas fa-location-arrow"></i></a> : <span className="flex-1 text-[10px] font-bold font-sans text-gray-300 text-center uppercase cursor-not-allowed">Maps <i className="fas fa-location-arrow"></i></span>}
                          </div>
                          <div className="hidden bg-gray-50 dark:bg-gray-700/30 p-3 text-[10px] border-t mt-2 dark:text-gray-300 whitespace-pre-line font-sans">{m.address||'No notes.'}</div>
                      </div>
                  );
              })}
              {visibleLimit < activeMosques.length && (
                  <button onClick={() => setVisibleLimit(prev => prev + 20)} className="w-full py-2 mt-2 bg-gray-100 dark:bg-gray-800 text-gray-500 text-[10px] font-bold uppercase rounded-xl">Load More</button>
              )}
          </div>
      );
  };

  const shareMessageText = `السلام عليكم ورحمة الله وبركاته 🌙\n\n🌙 This Ramadān, stay connected to the Masjid — on time, every time.\n\nWe’re pleased to introduce Jamaat on Time — a simple and useful web app to help you keep track of jamāʿah timings across various masājid.\n\n✨ Features include:\n• 🕌 Jamāʿah timings for multiple masājid (including Jumuʿah)\n• 🌙 Tarāweeḥ details\n• 🎉 Eid prayer timings\n• ⭐ Add nearby masājid to your Favorites list\n• 🔎 Instantly search by area, masjid name, or timing\n• 📱 Easy access from your phone\n\n🔗 Access the web app here:\nhttps://bit.ly/JamaatOnTime\n\n📢 Join our WhatsApp group for updates & feedback:\nhttps://chat.whatsapp.com/D5sJdbLNsNGGwzXNW7vNmL\n\nIf you find it beneficial, please share it with your family and friends.\n\nجزاك الله خيرًا\nوالسلام عليكم ورحمة الله وبركاته 🌿`;
  const encodedMessage = encodeURIComponent(shareMessageText);

  // --- MAP STYLING ---
  const mapStylesDark = [
      { elementType: "geometry", stylers: [{ color: "#111827" }] },
      { elementType: "labels.text.stroke", stylers: [{ color: "#111827" }] },
      { elementType: "labels.text.fill", stylers: [{ color: "#9ca3af" }] },
      { featureType: "administrative.locality", elementType: "labels.text.fill", stylers: [{ color: "#d1d5db" }] },
      { featureType: "poi", stylers: [{ visibility: "off" }] },
      { featureType: "road", elementType: "geometry", stylers: [{ color: "#1f2937" }] },
      { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: "#374151" }] },
      { featureType: "water", elementType: "geometry", stylers: [{ color: "#134e4a" }] }
  ];
  
  const mapStylesLight = [
      { elementType: "geometry", stylers: [{ color: "#f9fafb" }] },
      { elementType: "labels.text.fill", stylers: [{ color: "#0d9488" }] },
      { elementType: "labels.text.stroke", stylers: [{ color: "#ffffff" }] },
      { featureType: "poi", stylers: [{ visibility: "off" }] },
      { featureType: "road", elementType: "geometry", stylers: [{ color: "#ffffff" }] },
      { featureType: "road.arterial", elementType: "geometry", stylers: [{ color: "#ccfbf1" }] },
      { featureType: "water", elementType: "geometry", stylers: [{ color: "#99f6e4" }] }
  ];

  // --- MAIN RENDER ---
  return (
    <div className="bg-gray-50 dark:bg-gray-900 text-gray-800 dark:text-gray-100 font-sans transition-colors duration-200 h-screen overflow-hidden flex flex-col relative">
        
        {/* SIDEBAR OVERLAY */}
        <div onClick={() => setIsSidebarOpen(false)} className={`fixed inset-0 bg-black/50 z-[60] transition-opacity backdrop-blur-sm ${isSidebarOpen ? '' : 'hidden'}`}></div>
        
        {/* SIDEBAR */}
        <div className={`fixed top-0 left-0 h-full w-72 bg-white dark:bg-gray-800 shadow-2xl z-[70] transform ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'} transition-transform duration-300 ease-in-out p-6 flex flex-col`}>
            <div className="mb-6 pb-6 border-b border-gray-100 dark:border-gray-700">
                {currentUser ? (
                    <div>
                        <div className="flex items-center gap-3 mb-3">
                            <img src={currentUser.photoURL} alt="User" className="w-10 h-10 rounded-full border-2 border-brand-500" />
                            <div><p className="text-xs font-bold text-gray-800 dark:text-white truncate max-w-[140px]">{currentUser.displayName}</p><p className="text-[9px] font-bold uppercase tracking-wider text-brand-600 bg-brand-50 dark:bg-brand-900/30 px-1.5 py-0.5 rounded inline-block">{userRole}</p></div>
                        </div>
                        <div className="flex items-center justify-between">
                            <button onClick={() => signOut(auth)} className="text-xs font-bold text-red-500 hover:text-red-700">Log Out</button>
                            {userRole !== 'admin' && (
                                <button onClick={async () => {
                                    const { updateDoc, doc } = await import('firebase/firestore');
                                    await updateDoc(doc(db, 'users', currentUser.uid), { role: 'admin' });
                                    alert("Admin rights restored!");
                                }} className="text-xs font-bold text-brand-600 bg-brand-50 px-2 py-1 rounded">Restore Admin</button>
                            )}
                        </div>
                    </div>
                ) : (
                    <button onClick={() => signInWithPopup(auth, provider)} className="w-full flex items-center justify-center gap-2 py-3 bg-gray-900 text-white rounded-xl text-xs font-bold shadow-lg hover:bg-gray-800 transition-colors"><i className="fab fa-google"></i> Sign in to Sync</button>
                )}
            </div>
            <h2 className="text-2xl font-serif font-bold mb-1 text-brand-600 dark:text-brand-400">Settings</h2>
            <p className="text-xs text-gray-400 mb-8 uppercase tracking-widest font-sans">Preferences</p>
            <div className="space-y-6 flex-1">
                <div className="bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 flex items-center justify-center rounded-lg bg-gray-200 dark:bg-gray-700 transition">
                      <i className={`fas ${appSettings.theme === 'dark' ? 'fa-moon' : 'fa-sun'} text-gray-700 dark:text-gray-300`}></i>
                    </div>
                    <div className="font-semibold text-sm text-gray-800 dark:text-gray-200">Dark Mode</div>
                  </div>
                  <button onClick={toggleTheme} className={`relative inline-flex h-6 w-11 items-center rounded-full transition-all duration-300 ${appSettings.theme === 'dark' ? 'bg-brand-600 shadow-inner' : 'bg-gray-300 dark:bg-gray-600'} active:scale-95 active:brightness-95`}>
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-all duration-300 ${appSettings.theme === 'dark' ? 'translate-x-6' : 'translate-x-1'}`} />
                  </button>
                </div>
                <hr className="border-gray-100 dark:border-gray-700" />
                <div className={userRole !== 'admin' ? 'restricted' : ''}>
                    <h3 className="text-[10px] font-bold uppercase text-gray-400 mb-4 tracking-wider flex justify-between items-center font-sans">Seasonal Visibility <i className="fas fa-lock text-[9px] opacity-30"></i></h3>
                    <div className="space-y-4 text-sm font-medium font-sans">
                        {['ramadan', 'eidFitr', 'eidAdha', 'qiyam', 'lateIsha'].map(key => (
                            <div key={key} className="flex justify-between items-center"><span className="capitalize">{key.replace(/([A-Z])/g, ' $1').trim()}</span><input type="checkbox" checked={appSettings[key]} onChange={() => toggleMode(key)} className="accent-brand-600 w-4 h-4"/></div>
                        ))}
                    </div>
                </div>
            </div>
            {installPrompt && (
                <button onClick={handleInstallClick} className="w-full mt-4 flex items-center justify-center gap-3 py-4 bg-brand-600 text-white rounded-2xl shadow-lg border-2 border-brand-500 animate-bounce">
                    <i className="fas fa-download"></i><span className="text-xs font-bold uppercase tracking-wider">Install App</span>
                </button>
            )}
        </div>

        {/* Sticky Location Banner */}
        {locStatus === 'denied' && (
            <div className="fixed top-[50px] w-full z-[45] bg-amber-50 dark:bg-amber-900/50 border-b border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-100 px-4 py-2 flex items-center justify-between shadow-sm cursor-pointer" onClick={() => alert("Please tap the 'Lock' icon in your browser URL bar and change Location permissions to 'Allow', then refresh.")}>
                <div className="flex items-center gap-2 text-[10px] font-bold">
                    <i className="fas fa-exclamation-triangle"></i>
                    <span>Location access required for Nearby features.</span>
                </div>
                <span className="text-[10px] font-bold underline">Fix</span>
            </div>
        )}

        {/* HEADER */}
        <div className="fixed top-0 w-full z-50 bg-white/90 dark:bg-gray-800/90 backdrop-blur-md shadow-sm border-b border-gray-100 dark:border-gray-700 h-[50px]">
            <div className="flex items-center justify-between px-3 h-full">
                <button onClick={() => setIsSidebarOpen(true)} className="text-gray-500 hover:text-brand-600 w-8 h-8 flex items-center justify-center rounded-full"><i className="fas fa-bars text-lg"></i></button>
                <div className="flex flex-col items-center">
                    <h1 className="text-lg font-serif font-bold text-brand-600 dark:text-brand-400 tracking-tight leading-none">Jamaat on Time</h1>
                    <div className="flex items-center gap-1 mt-0.5 text-gray-400 cursor-pointer" onClick={() => setActiveModal('city')}>
                        <i className="fas fa-map-marker-alt text-[8px]"></i>
                        <span className="text-[9px] font-bold uppercase tracking-[0.1em]">{appSettings.city}</span>
                    </div>
                </div>
                <div className="w-8 flex items-center justify-center">
                    {isFriday && <span className="bg-emerald-50 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400 px-1.5 py-0.5 rounded text-[8px] font-bold uppercase border border-emerald-100 dark:border-emerald-800/50 shadow-sm">Jumu'ah</span>}
                </div>
            </div>
        </div>

        {/* Dynamic Map & Bottom Sheet Layout (ONLY for Prayer Tab) */}
        {viewMode === 'next' && (
            <div className={`relative flex-1 flex flex-col w-full mt-[50px] ${locStatus === 'denied' ? 'mt-[85px]' : ''}`}>
                
                {/* Map Layer */}
                <div onTouchStart={() => setMapExpanded(true)} onMouseDown={() => setMapExpanded(true)} className={`absolute top-0 w-full transition-all duration-500 ease-in-out ${mapExpanded ? 'h-full pb-[15vh]' : 'h-[45vh]'} ${locStatus === 'denied' ? 'grayscale opacity-30 pointer-events-none' : ''}`}>
                    <APIProvider apiKey={GOOGLE_MAPS_API_KEY} language="ur">
        {mapCameraCenter && (searchCenter || userLocation) && getDistance(mapCameraCenter.lat, mapCameraCenter.lng, (searchCenter || userLocation).lat, (searchCenter || userLocation).lng) > 1.5 && (
           <div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-[60] animate-fadeIn pointer-events-auto">
               <button onClick={() => { setSearchCenter(mapCameraCenter); setMapCameraCenter(null); if(currentList!=='Nearby') setCurrentList('Nearby'); }} className="bg-white/95 dark:bg-gray-800/95 backdrop-blur shadow-lg px-4 py-2 rounded-full text-xs font-bold font-sans text-brand-600 dark:text-brand-400 border border-gray-100 dark:border-gray-700 hover:scale-105 transition-transform flex items-center gap-2">
                   <i className="fas fa-search-location"></i> Search this area
               </button>
           </div>
        )}

        {searchCenter && (
           <div className="absolute top-4 right-4 z-[60] animate-fadeIn pointer-events-auto">
               <button onClick={() => { setSearchCenter(null); setMapCameraCenter(null); setRecenterTrigger({ lat: userLocation.lat, lng: userLocation.lng, _t: Date.now() }); }} className="bg-white dark:bg-gray-800 shadow-xl w-10 h-10 rounded-full border border-gray-100 dark:border-gray-700 flex items-center justify-center text-brand-600 dark:text-brand-400 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors tooltip-target" title="Return to my location">
                   <i className="fas fa-crosshairs text-md"></i>
               </button>
           </div>
        )}

        <Map 
            key={`${appSettings.theme}-${userLocation ? 'loc' : 'noloc'}`}
            defaultZoom={13} 
            defaultCenter={userLocation || { lat: 17.3850, lng: 78.4867 }}
            disableDefaultUI={true}
            gestureHandling={'greedy'}
            mapId="54617387409a464ce525dc8d" 
            colorScheme={appSettings.theme === 'dark' ? 'DARK' : 'LIGHT'}
            onClick={() => setMapExpanded(true)}
            onCameraChanged={(e) => setMapCameraCenter(e.detail.center)}
        >
            <MapController targetCenter={recenterTrigger} />
            {userLocation && (
                <AdvancedMarker position={userLocation}>
                    <div className="w-4 h-4 bg-blue-500 border-2 border-white rounded-full shadow-lg pulse-ring"></div>
                </AdvancedMarker>
            )}
            {activeMosques.map(m => {
                if (!m.coordinates) return null;
                const prayerToDisplay = currentList === 'Jummah' ? 'jumma' : currentTargetPrayer;
                const activeTimeStr = m.timings?.[prayerToDisplay]?.time;
                let activeTimeLabel = null;
                let activeAmpm = null;
                if (activeTimeStr) {
                    const [h, min] = activeTimeStr.split(':');
                    const hrs24 = parseInt(h);
                    const hrs = hrs24 % 12 || 12;
                    activeAmpm = hrs24 >= 12 ? 'PM' : 'AM';
                    activeTimeLabel = `${hrs}:${min}`;
                }
                
                return (
                    <AdvancedMarker key={m.id} position={m.coordinates} onClick={() => { setSelectedMosqueId(m.id); setActiveModal('detail'); }} className="relative z-0 hover:z-[60] group">
                        <div className="flex flex-col items-center drop-shadow-md transform transition-transform group-hover:scale-110">
                            {activeTimeLabel && (
                                <div className="bg-white/95 dark:bg-gray-800/95 backdrop-blur-sm px-1.5 py-0.5 rounded shadow-sm text-[10px] sm:text-[11px] font-bold font-anonymous text-brand-700 dark:text-brand-300 pointer-events-none whitespace-nowrap mb-0.5 border border-gray-100 dark:border-gray-700 flex items-baseline gap-0.5">
                                    <span>{activeTimeLabel}</span>
                                    <span className="text-[7.5px] font-sans opacity-80">{activeAmpm}</span>
                                </div>
                            )}
                            <svg width="20" height="28" viewBox="0 0 24 34" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <path d="M12 0C5.37258 0 0 5.37258 0 12C0 21 12 34 12 34C12 34 24 21 24 12C24 5.37258 18.6274 0 12 0Z" fill={appSettings.theme === 'dark' ? '#0d9488' : '#14b8a6'} />
                                <circle cx="12" cy="12" r="4.5" fill="#ffffff" />
                            </svg>
                        </div>
                    </AdvancedMarker>
                );
            })}
        </Map>
</APIProvider>
                </div>

                {/* Bottom Sheet Layer */}
                <div className={`absolute bottom-0 w-full bg-white/95 dark:bg-gray-900/95 backdrop-blur-xl border-t border-gray-200 dark:border-gray-800 shadow-[0_-10px_40px_rgba(0,0,0,0.15)] rounded-t-3xl transition-all duration-500 ease-in-out flex flex-col z-30 pb-[70px] ${mapExpanded ? 'h-[25vh]' : 'h-[65vh]'}`}>
                    <div className="w-full py-3 flex justify-center cursor-pointer" onClick={() => setMapExpanded(!mapExpanded)}>
                        <div className="w-12 h-1.5 bg-gray-300 dark:bg-gray-600 rounded-full"></div>
                    </div>
                    <div className="w-full px-4 pb-1">
                        <div className="flex overflow-x-auto no-scrollbar gap-2 font-sans py-0.5">
                            {['Nearby', 'All', 'Favorites', ...Object.keys(personalLists).filter(l => !['Favorites','Home','Work'].includes(l))].map(list => (
                                <button key={list} onClick={() => { setCurrentList(list); setVisibleLimit(20); setMapExpanded(false); }} className={`px-4 py-1.5 rounded-full text-[11px] font-bold transition-all whitespace-nowrap border ${currentList === list ? 'bg-brand-600 text-white border-brand-600 shadow-md' : 'bg-gray-100 dark:bg-gray-800 text-gray-500 border-transparent dark:border-gray-700'}`}>
                                    {list}
                                </button>
                            ))}
                            <button onClick={() => setCurrentList('Jummah')} className={`px-4 py-1.5 rounded-full text-[11px] font-bold transition-all whitespace-nowrap border ${currentList === 'Jummah' ? 'bg-emerald-800 text-white border-emerald-800 shadow-md' : 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 border-transparent'}`}>Jummah</button>
                        </div>
                    </div>
                    <div className="flex-1 overflow-y-auto px-4 py-2" onTouchStart={() => setMapExpanded(false)} onMouseDown={() => setMapExpanded(false)} onClick={() => setMapExpanded(false)}>
                        {renderNextPrayerMode()}
                    </div>
                </div>
            </div>
        )}

        {/* Standard List Tab Override (No Map) */}
        {viewMode === 'list' && (
            <div className={`flex-1 flex flex-col w-full overflow-hidden pt-[50px] ${locStatus === 'denied' ? 'pt-[85px]' : ''} bg-gray-50 dark:bg-gray-900`}>
                <div className="w-full px-4 pt-3 pb-2 bg-white dark:bg-gray-800 shadow-sm border-b border-gray-100 dark:border-gray-700 z-10">
                    <div className="relative mb-3">
                        <i className="fas fa-search absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 text-xs"></i>
                        <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search Masājid..." className="w-full bg-gray-100 dark:bg-gray-700/50 border-none rounded-lg py-2 pl-9 pr-4 text-xs font-bold outline-none dark:text-white focus:ring-2 focus:ring-brand-500 font-sans" />
                    </div>
                    <div className="flex overflow-x-auto no-scrollbar gap-2 font-sans py-1">
                        {['Nearby', 'All', 'Favorites', ...Object.keys(personalLists).filter(l => !['Favorites','Home','Work'].includes(l))].map(list => (
                            <button key={list} onClick={() => { setCurrentList(list); setVisibleLimit(20); }} className={`px-4 py-1.5 rounded-full text-[11px] font-bold transition-all whitespace-nowrap border ${currentList === list ? 'bg-brand-600 text-white border-brand-600 shadow-md' : 'bg-gray-100 dark:bg-gray-800 text-gray-500 border-transparent dark:border-gray-700'}`}>
                                {list}
                            </button>
                        ))}
                    </div>
                </div>
                <div className="flex-1 overflow-y-auto px-4 pt-4 pb-24 z-0">
                    {renderListMode()}
                </div>
            </div>
        )}

        {/* Info Tab Override */}
        {viewMode === 'info' && (
            <div className="flex-1 overflow-y-auto px-4 pt-[70px] pb-24 z-30 bg-gray-50 dark:bg-gray-900">
                <div className="animate-card max-w-sm mx-auto space-y-8">
                    <div className="flex justify-center"><img src="assets/bismillah-jot1.png" className="h-16 w-auto opacity-80 dark:invert" alt="Bismillah" /></div>
                    <p className="text-center text-sm font-ptsans text-gray-600 dark:text-gray-300 leading-relaxed italic px-2 font-ptsans">"Alhamdulillāh, Allāh ﷻ has given us this opportunity to be of some use to the Ummah, by creating this tool. Our sole intention is to help our brethren to be more punctual in their jamāʿah prayers."</p>
                    
                    <div className="space-y-3 font-sans">
                        <h3 className="text-[10px] font-bold uppercase text-gray-400 tracking-widest ml-1">Frequently Asked Questions</h3>
                        <FAQItem q="Why are there no Maghrib timings?" a="Maghrib timings are usually the same in all the masājid around us, around sunset, and is not difficult for most people to be reminded." />
                        <FAQItem q="My nearby masjid timings are missing, what to do?" a="You can contribute to our timings database via our <a href='https://chat.whatsapp.com/D5sJdbLNsNGGwzXNW7vNmL' target='_blank' class='text-brand-600 underline'>WhatsApp group</a>." />
                        <FAQItem q="How do I install this app?" a="On Android, just open the sidebar of this web app, and click on 'Install App', and drag the icon to your home screen." />
                        <FAQItem q="How reliable are these timings?" a="These rely on contributions by volunteers. Most of them are reliable but some may be wrong. You can report wrong timings in our WhatsApp group." />
                    </div>

                    <div className="space-y-3 pt-4 font-sans"> 
                        {installPrompt && (
                            <button onClick={handleInstallClick} className="flex items-center justify-center gap-3 w-full py-4 bg-brand-600 text-white rounded-2xl shadow-lg mb-4">
                                <i className="fas fa-mobile-alt text-xl"></i><span className="text-sm font-bold uppercase tracking-wider">Install App</span>
                            </button>
                        )}
                        <a href="https://chat.whatsapp.com/D5sJdbLNsNGGwzXNW7vNmL" target="_blank" rel="noreferrer" className="flex items-center justify-center gap-3 w-full py-4 bg-[#075E54] text-white rounded-2xl shadow-lg hover:brightness-110 transition-all"><i className="fab fa-whatsapp text-xl"></i><span className="text-sm font-bold uppercase tracking-wider">Join WhatsApp Group</span></a>
                        <button onClick={() => setActiveModal('contact')} className="flex items-center justify-center gap-3 w-full py-4 bg-gray-800 text-white rounded-2xl shadow-lg hover:brightness-110 transition-all"><i className="fas fa-envelope text-xl"></i><span className="text-sm font-bold uppercase tracking-wider">Contact Us</span></button>
                        <a href={`https://wa.me/?text=${encodedMessage}`} target="_blank" rel="noreferrer" className="flex items-center justify-center gap-3 w-full py-4 bg-[#25D366] text-white rounded-2xl shadow-lg hover:brightness-110 transition-all"><i className="fab fa-whatsapp text-xl"></i><span className="text-sm font-bold uppercase tracking-wider">Share on WhatsApp</span></a>
                    </div>
                    <div className="pt-8 pb-4 text-center font-sans"><p className="text-[10px] font-medium text-gray-400 uppercase tracking-[0.2em]">Made with <span className="text-red-400 mx-0.5">♡</span> in Hyderabad, India</p></div>
                </div>
            </div>
        )}

        {/* BOTTOM NAVIGATION */}
        <div className="fixed bottom-0 w-full bg-white/90 dark:bg-gray-800/90 backdrop-blur-md border-t border-gray-200 dark:border-gray-700 p-2 flex justify-around z-50 pb-safe font-sans h-[65px]">
            <button onClick={() => { setViewMode('next'); setMapExpanded(false); }} className={`nav-btn w-16 group flex flex-col items-center justify-center ${viewMode === 'next' ? 'text-brand-600' : 'text-gray-400'}`}><i className="fas fa-clock text-lg mb-1"></i><span className="text-[10px] font-bold">Prayer</span></button>
            <button onClick={() => { setViewMode('list'); setMapExpanded(false); }} className={`nav-btn w-16 group flex flex-col items-center justify-center ${viewMode === 'list' ? 'text-brand-600' : 'text-gray-400'}`}><i className="fas fa-mosque text-lg mb-1"></i><span className="text-[10px] font-bold">Masājid</span></button>
            <button onClick={() => { setViewMode('info'); setMapExpanded(false); }} className={`nav-btn w-16 group flex flex-col items-center justify-center ${viewMode === 'info' ? 'text-brand-600' : 'text-gray-400'}`}><i className="fas fa-info-circle text-lg mb-1"></i><span className="text-[10px] font-bold">Info</span></button>
        </div>

        {/* FLOATING ACTION BUTTON */}
        {(userRole === 'admin' || userRole === 'volunteer') && viewMode !== 'info' && (
            <button onClick={() => tryAction('edit', () => openMosqueModal(null))} className="fixed bottom-24 right-4 w-14 h-14 bg-brand-600 text-white rounded-full shadow-2xl flex items-center justify-center z-50 hover:scale-105"><i className="fas fa-plus text-xl"></i></button>
        )}

        {/* MODALS */}
        
        {/* City Modal */}
        {activeModal === 'city' && (
            <div onClick={(e) => handleModalClickOutside(e, 'city')} className="fixed inset-0 z-[80] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
                <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-sm shadow-2xl animate-card overflow-hidden">
                    <div className="p-5 border-b border-gray-100 dark:border-gray-700">
                        <div className="flex justify-between items-center mb-4"><h3 className="text-lg font-serif font-bold dark:text-white">Select City</h3><button onClick={() => setActiveModal(null)} className="text-gray-400"><i className="fas fa-times"></i></button></div>
                        <div className="flex gap-2 font-sans"><input type="text" value={newCityInput} onChange={e=>setNewCityInput(e.target.value)} placeholder="Add new city..." className="flex-1 bg-gray-50 dark:bg-gray-700/50 border rounded-lg px-3 py-2 text-xs font-bold outline-none dark:text-white" /><button onClick={addNewCity} className="bg-brand-600 text-white px-4 py-2 rounded-lg text-xs font-bold shadow"><i className="fas fa-plus"></i></button></div>
                    </div>
                    <div className="max-h-[60vh] overflow-y-auto p-2 font-sans">
                        {Array.from(availableCities).sort().map(c => (
                            <div key={c} onClick={() => { setAppSettings(prev=>({...prev, city:c})); localStorage.setItem('city', c); setActiveModal(null); }} className={`flex justify-between items-center p-3 mb-1 rounded-lg cursor-pointer ${appSettings.city === c ? 'bg-brand-50 dark:bg-brand-900/20' : 'bg-gray-50 dark:bg-gray-700/30'}`}>
                                <span className="text-sm font-bold dark:text-white">{c}</span>{appSettings.city === c && <i className="fas fa-check text-brand-600"></i>}
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        )}

        {/* Personal List Modal */}
        {activeModal === 'personalList' && (
          <div onClick={(e) => { handleModalClickOutside(e, 'personalList'); setEditingList(null); }} className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-md flex items-center justify-center p-4">
            <div className="bg-white dark:bg-gray-900 rounded-3xl w-full max-w-sm shadow-2xl animate-card overflow-hidden border border-gray-100 dark:border-gray-800 flex flex-col max-h-[85vh]">
              <div className="flex justify-between items-center px-6 py-5 border-b border-gray-50 dark:border-gray-800">
                <div>
                  <h3 className="text-xl font-bold text-gray-900 dark:text-white">Manage Lists</h3>
                  <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-0.5">Organize your Masājid</p>
                </div>
                <button onClick={() => { setActiveModal(null); setEditingList(null); }} className="w-10 h-10 rounded-full bg-gray-50 dark:bg-gray-800 text-gray-500 flex items-center justify-center hover:bg-gray-100 transition-colors"><i className="fas fa-times"></i></button>
              </div>

              <div className="p-4 overflow-y-auto no-scrollbar space-y-2">
                {(() => {
                  const defaultOrder = ['Favorites', 'Home', 'Work'];
                  const allNames = Object.keys(personalLists);
                  const sortedListNames = allNames.sort((a, b) => {
                    const aDef = defaultOrder.indexOf(a); const bDef = defaultOrder.indexOf(b);
                    if (aDef !== -1 && bDef !== -1) return aDef - bDef;
                    if (aDef !== -1) return -1; if (bDef !== -1) return 1;
                    return a.localeCompare(b);
                  });

                  return sortedListNames.map(listName => {
                    const isAdded = personalLists[listName].includes(selectedMosqueId);
                    const isDefault = defaultOrder.includes(listName);
                    const isEditing = editingList === listName;
                    let iconClass = "fa-folder";
                    if (listName === 'Favorites') iconClass = "fa-heart text-red-500";
                    else if (listName === 'Home') iconClass = "fa-home text-blue-500";
                    else if (listName === 'Work') iconClass = "fa-briefcase text-amber-500";

                    return (
                      <div key={listName} className={`flex items-center justify-between p-3 rounded-2xl border transition-all ${isAdded ? 'bg-brand-50/30 dark:bg-brand-900/10 border-brand-100 dark:border-brand-900/50' : 'bg-white dark:bg-gray-900 border-gray-100 dark:border-gray-800 shadow-sm'}`}>
                        <div className="flex items-center gap-3 flex-1">
                          <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-gray-50 dark:bg-gray-800/50"><i className={`fas ${iconClass} text-sm`}></i></div>
                          {isEditing ? (
                            <input type="text" autoFocus value={editListInput} onChange={e => setEditListInput(e.target.value)} onBlur={() => renamePersonalList(listName)} onKeyDown={(e) => e.key === 'Enter' && renamePersonalList(listName)} className="flex-1 bg-white dark:bg-gray-900 border-2 border-brand-500 rounded-lg px-2 py-1 text-sm font-bold text-gray-900 dark:text-white outline-none" />
                          ) : (
                            <span className="text-sm font-bold text-gray-700 dark:text-gray-200">{listName}</span>
                          )}
                        </div>
                        <div className="flex items-center gap-3">
                          {!isDefault && !isEditing && (
                            <div className="flex gap-1 items-center border-r border-gray-100 dark:border-gray-700 pr-2 mr-1">
                              <button onClick={() => { setEditingList(listName); setEditListInput(listName); }} className="w-8 h-8 rounded-lg text-gray-400 hover:text-brand-600 hover:bg-brand-50 dark:hover:bg-brand-900/30 flex items-center justify-center"><i className="fas fa-pencil-alt text-[10px]"></i></button>
                              <button onClick={() => deletePersonalList(listName)} className="w-8 h-8 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 flex items-center justify-center"><i className="fas fa-trash-alt text-[10px]"></i></button>
                            </div>
                          )}
                          <button onClick={() => togglePersonalList(listName, selectedMosqueId)} className={`w-10 h-10 rounded-xl border-2 flex items-center justify-center transition-all active:scale-90 ${isAdded ? 'bg-brand-600 border-brand-600 text-white shadow-md shadow-brand-500/20' : 'border-gray-200 dark:border-gray-700 bg-transparent text-transparent hover:border-brand-300'}`}>
                            <i className="fas fa-check text-xs"></i>
                          </button>
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>

              <div className="p-4 bg-gray-50 dark:bg-gray-800/30 border-t border-gray-100 dark:border-gray-800">
                <div className="flex gap-2">
                    <div className="relative flex-1">
                        <i className="fas fa-folder-plus absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 text-xs"></i>
                        <input type="text" value={newListInput} onChange={e=>setNewListInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && createNewPersonalList()} placeholder="New list name..." className="w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-2xl pl-10 pr-4 py-3 text-xs font-bold text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-brand-500/20" />
                    </div>
                    <button onClick={createNewPersonalList} disabled={!newListInput.trim()} className="px-5 py-3 bg-brand-600 disabled:opacity-50 hover:bg-brand-700 text-white rounded-2xl text-xs font-bold uppercase tracking-widest transition-all active:scale-95 shadow-lg shadow-brand-500/20">Add</button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Details Modal */}
        {activeModal === 'detail' && selectedMosqueDetail && (
          <div onClick={(e) => handleModalClickOutside(e, 'detail')} className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white dark:bg-gray-900 rounded-2xl w-full max-w-sm max-h-[85vh] shadow-2xl flex flex-col animate-card overflow-hidden border border-gray-100 dark:border-gray-800">
              <div className="p-5 border-b border-gray-100 dark:border-gray-800 bg-gray-50/70 dark:bg-gray-900 flex justify-between items-start">
                <div className="flex items-start gap-3">
                  <i className="fas fa-mosque text-brand-600 text-xl mt-1"></i>
                  <div>
                    <h2 className="text-xl font-sans font-bold text-gray-900 dark:text-white leading-tight">{selectedMosqueDetail.name}</h2>
                    <p className="text-xs font-bold text-gray-500 dark:text-gray-400 mt-1 font-sans">{selectedMosqueDetail.area}</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  {(userRole === 'admin' || userRole === 'volunteer') && (
                    <button onClick={() => tryAction('edit', () => openMosqueModal(selectedMosqueId))} className="w-8 h-8 rounded-full bg-brand-50 dark:bg-brand-900/30 text-brand-600 dark:text-brand-400 flex items-center justify-center hover:bg-brand-100"><i className="fas fa-pencil-alt text-xs"></i></button>
                  )}
                  <button onClick={() => setActiveModal(null)} className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 flex items-center justify-center"><i className="fas fa-times"></i></button>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-5 font-sans">
                <div className="space-y-2 cursor-pointer" onClick={() => tryAction('edit', () => openEditTiming(selectedMosqueId))}>
                  {['fajr', 'zuhr', 'asr', 'isha', 'jumma'].map(pid => {
                    const data = selectedMosqueDetail.timings[pid];
                    const hasTime = data && data.time;
                    const predicted = hasTime && isTimingPredicted(data.lastUpdated) && !data.fixed;
                    const pObj = prayersList.find(p => p.id === pid);
                    const taraweeh = (pid === 'isha' && appSettings.ramadan && selectedMosqueDetail.timings['taraweeh']?.time) ? selectedMosqueDetail.timings['taraweeh'].time : null;
                    
                    return (
                      <div key={pid} className={`flex justify-between items-center p-3.5 rounded-xl mb-2 border transition ${!hasTime ? 'opacity-40' : ''} bg-gray-50 dark:bg-gray-800 border-gray-100 dark:border-gray-700`}>
                        <span className="flex items-center" dir="ltr">
                          <span className="font-bold text-sm text-gray-700 dark:text-gray-300 font-sans flex items-center gap-1.5"><i className={`fas ${pObj.icon} text-xs w-4 text-gray-500`}></i>{pObj.name}</span>
                          <span className="mx-2 h-4 w-px bg-gray-300 dark:bg-gray-600"></span>
                          <span className="font-arabic text-sm font-bold text-gray-700 dark:text-gray-300" dir="rtl">{pObj.arabic}</span>
                        </span>
                        <div className="text-right flex flex-col items-end leading-none tabular-nums relative">
                          <span className={hasTime ? 'font-anonymous text-lg font-bold text-gray-900 dark:text-white' : 'text-[10px] text-gray-400 italic'} dangerouslySetInnerHTML={{ __html: hasTime ? formatTime12(data.time, pid) : '(Timing not entered)' }}></span>
                          {predicted && <span className="text-amber-500 absolute -top-1 -left-2 text-[10px]" title="Predicted Timing">*</span>}
                          {hasTime && data.lastUpdated && !data.fixed && <div className="w-full text-center font-ptsans text-[9px] text-gray-400/80 -mt-1">{getRelativeTime(data.lastUpdated)}</div>}
                          {taraweeh && <div className="text-[9px] font-bold mt-1 px-2 py-0.5 rounded bg-amber-400/90 dark:bg-amber-500 text-black">Tarāweeḥ: <span className="font-anonymous ml-1">{taraweeh}</span> Pārahs</div>}
                        </div>
                      </div>
                    );
                  })}
                </div>
                {selectedMosqueDetail.address && (
                  <div className="bg-gray-50 dark:bg-gray-800/60 rounded-xl p-4 border border-gray-100 dark:border-gray-700 mt-4 mb-2">
                    <h4 className="text-[10px] font-bold text-gray-400 uppercase mb-2 tracking-wider">Notes</h4>
                    <p className="text-xs text-gray-600 dark:text-gray-300 whitespace-pre-line leading-relaxed">{selectedMosqueDetail.address}</p>
                  </div>
                )}
              </div>
              <div className="p-4 border-t border-gray-100 dark:border-gray-800 space-y-2 font-sans">
                <button onClick={() => { if (!personalLists.Favorites?.includes(selectedMosqueId)) togglePersonalList('Favorites', selectedMosqueId); setActiveModal('personalList'); }} className={`flex items-center justify-center w-full font-bold py-3.5 rounded-2xl transition-all ${personalLists.Favorites?.includes(selectedMosqueDetail.id) ? 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 border border-red-100' : 'bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200'}`}>
                  <i className={`fas fa-heart mr-2 ${personalLists.Favorites?.includes(selectedMosqueDetail.id) ? 'text-red-500' : 'text-gray-400'}`}></i>{personalLists.Favorites?.includes(selectedMosqueDetail.id) ? 'Saved to Favorites' : 'Add to Favorites'}
                </button>
                {selectedMosqueDetail.locationLink && (
                  <a href={selectedMosqueDetail.locationLink} target="_blank" rel="noreferrer" className="flex items-center justify-center w-full bg-brand-600 hover:bg-brand-700 text-white font-bold py-3 rounded-xl shadow-lg transition"><i className="fas fa-location-arrow mr-2"></i> Directions</a>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Timings Edit Modal */}
        {activeModal === 'timing' && selectedMosqueDetail && (
          <div onClick={(e) => handleModalClickOutside(e, 'timing')} className="fixed inset-0 z-50 bg-black/60 backdrop-blur-md flex items-center justify-center p-4">
            <div className="bg-white dark:bg-gray-900 rounded-3xl w-full max-w-sm shadow-2xl animate-card max-h-[90vh] flex flex-col overflow-hidden border border-gray-100 dark:border-gray-800">
              <div className="flex justify-between items-center px-5 py-4 border-b border-gray-100 dark:border-gray-800">
                <div>
                  <h3 className="text-[10px] font-bold text-brand-600 uppercase tracking-widest mb-0.5">Prayer Schedule</h3>
                  <p className="text-lg font-bold text-gray-900 dark:text-white leading-tight truncate max-w-[200px]">{selectedMosqueDetail.name}</p>
                </div>
                <button onClick={() => setActiveModal(null)} className="w-10 h-10 rounded-full bg-gray-50 dark:bg-gray-800 text-gray-500 flex items-center justify-center hover:bg-red-50 hover:text-red-500 transition-colors"><i className="fas fa-times"></i></button>
              </div>
              <div className="p-4 space-y-3 overflow-y-auto no-scrollbar">
                {(() => {
                  const getToday = () => new Date().toISOString().split('T')[0];
                  return prayersList.map((p) => {
                    const val = timingFormData[p.id]?.time || '';
                    const isFixed = timingFormData[p.id]?.fixed || false;
                    const updateDate = timingFormData[p.id]?.date || getToday();
                    const hasValue = val !== '';

                    return (
                      <div key={p.id} className={`relative rounded-2xl border transition-all p-3 ${hasValue ? 'border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-800/50' : 'border-dashed border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-transparent opacity-70'}`}>
                        <div className="flex justify-between items-center mb-2.5 px-1">
                          <span className="text-xs font-bold text-gray-900 dark:text-gray-100 uppercase tracking-tight">{p.name}</span>
                          <span className="text-lg font-arabic text-brand-600 dark:text-brand-400">{p.arabic}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <button disabled={!hasValue} onClick={() => { adjustTimingFormTime(p.id, -5); setTimingFormData(prev => ({ ...prev, [p.id]: { ...prev[p.id], date: getToday() } })); }} className="h-11 w-10 flex items-center justify-center rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-500 disabled:opacity-20 active:scale-90"><span className="text-[10px] font-bold">-5</span></button>
                          <div className={`relative flex-1 h-11 rounded-xl border flex items-center justify-center transition-all ${hasValue ? 'bg-gray-900 dark:bg-white border-transparent' : 'bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700'}`}>
                            <span className={`text-lg font-anonymous font-bold tabular-nums ${hasValue ? 'text-white dark:text-gray-900' : 'text-gray-300 dark:text-gray-600'}`}>{hasValue ? formatTime12(val).replace(/<[^>]*>?/gm, '') : 'NOT SET'}</span>
                            <input type="time" value={val} onChange={(e) => setTimingFormData({ ...timingFormData, [p.id]: { ...timingFormData[p.id], time: e.target.value, date: getToday() }})} className="absolute inset-0 opacity-0 cursor-pointer w-full" />
                          </div>
                          <button disabled={!hasValue} onClick={() => { adjustTimingFormTime(p.id, 5); setTimingFormData(prev => ({ ...prev, [p.id]: { ...prev[p.id], date: getToday() } })); }} className="h-11 w-10 flex items-center justify-center rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-500 disabled:opacity-20 active:scale-90"><span className="text-[10px] font-bold">+5</span></button>
                          <button onClick={() => { setTimingFormData({ ...timingFormData, [p.id]: { ...timingFormData[p.id], time: '' } }); }} className={`h-11 w-10 flex items-center justify-center rounded-xl transition-all ${hasValue ? 'bg-red-50 dark:bg-red-900/20 text-red-500 hover:bg-red-500 hover:text-white' : 'bg-transparent text-gray-300 pointer-events-none'}`}><i className="fas fa-times-circle text-sm"></i></button>
                        </div>
                        {hasValue && (
                          <div className="flex items-center justify-between mt-3 px-1">
                            <label className="flex items-center gap-2 cursor-pointer group">
                              <input type="checkbox" checked={isFixed} onChange={(e) => setTimingFormData({ ...timingFormData, [p.id]: { ...timingFormData[p.id], fixed: e.target.checked } }) } className="h-3.5 w-3.5 rounded border-gray-300 text-brand-600" />
                              <span className="text-[9px] font-bold text-gray-400 uppercase tracking-tight group-hover:text-gray-600">Fixed year-round</span>
                            </label>
                            {!isFixed && (
                              <div className="flex items-center gap-1.5 bg-brand-50 dark:bg-brand-900/10 px-2 py-0.5 rounded-md">
                                <i className="far fa-calendar-alt text-[9px] text-brand-500"></i>
                                <input type="date" value={updateDate} onChange={(e) => setTimingFormData({ ...timingFormData, [p.id]: { ...timingFormData[p.id], date: e.target.value || getToday() } }) } className="bg-transparent text-[10px] font-bold text-brand-700 dark:text-brand-400 outline-none w-20" />
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  });
                })()}
              </div>
              <div className="p-5 border-t border-gray-100 dark:border-gray-800">
                <button onClick={saveTimings} className="w-full py-4 bg-brand-600 hover:bg-brand-700 text-white rounded-2xl text-sm font-bold shadow-lg uppercase tracking-widest transition-all active:scale-95">Save All Changes</button>
              </div>
            </div>
          </div>
        )}

        {/* Info Edit Modal (Add/Edit Mosque) */}
        {activeModal === 'info' && (
          <div onClick={(e) => handleModalClickOutside(e, 'info')} className="fixed inset-0 z-50 bg-black/60 backdrop-blur-md flex items-center justify-center p-4">
            <div className="bg-white dark:bg-gray-900 rounded-3xl w-full max-w-sm shadow-2xl animate-card overflow-hidden border border-gray-100 dark:border-gray-800">
              <div className="flex justify-between items-center px-6 py-5 border-b border-gray-50 dark:border-gray-800">
                <div>
                  <h3 className="text-xl font-bold text-gray-900 dark:text-white">{selectedMosqueId ? 'Edit Masjid' : 'Add New Masjid'}</h3>
                  <p className="text-xs text-gray-400 font-medium uppercase tracking-wider">Basic Information</p>
                </div>
                {selectedMosqueId && (
                  <button onClick={deleteMosque} className="w-10 h-10 rounded-xl bg-red-50 dark:bg-red-900/20 text-red-500 flex items-center justify-center hover:bg-red-500 hover:text-white transition-all active:scale-90" title="Delete Masjid"><i className="fas fa-trash-alt"></i></button>
                )}
              </div>
              <div className="p-6 space-y-5">
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-gray-400 uppercase ml-1">Masjid Name</label>
                  <div className="relative">
                    <i className="fas fa-mosque absolute left-3 top-1/2 -translate-y-1/2 text-brand-500/50 text-sm"></i>
                    <input type="text" value={mosqueFormData.name} onChange={e => setMosqueFormData({ ...mosqueFormData, name: e.target.value })} className="w-full bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-700 rounded-xl pl-10 pr-4 py-3 font-bold text-gray-900 dark:text-white focus:ring-2 outline-none" placeholder="Masjid-e-Bilal" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-gray-400 uppercase ml-1">Area / Locality</label>
                  <div className="relative">
                    <i className="fas fa-map-marker-alt absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm"></i>
                    <input type="text" value={mosqueFormData.area} onChange={e => setMosqueFormData({ ...mosqueFormData, area: e.target.value })} className="w-full bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-700 rounded-xl pl-10 pr-4 py-2.5 text-sm font-medium text-gray-900 dark:text-white outline-none" placeholder="Banjara Hills" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-gray-400 uppercase ml-1">Google Maps Link</label>
                  <div className="relative">
                    <i className="fas fa-link absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs"></i>
                    <input type="url" value={mosqueFormData.locationLink} onChange={e => setMosqueFormData({ ...mosqueFormData, locationLink: e.target.value })} className="w-full bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-700 rounded-xl pl-10 pr-4 py-2.5 text-xs font-medium text-blue-600 outline-none" placeholder="https://goo.gl/maps/..." />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-gray-400 uppercase ml-1">Address & Notes</label>
                  <textarea value={mosqueFormData.address} onChange={e => setMosqueFormData({ ...mosqueFormData, address: e.target.value })} rows="2" className="w-full bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-700 rounded-xl px-4 py-3 text-xs font-medium text-gray-600 dark:text-white outline-none resize-none" placeholder="Full address or special instructions..."></textarea>
                </div>
              </div>
              <div className="p-6 bg-gray-50 dark:bg-gray-800/30 flex flex-col gap-3">
                {!selectedMosqueId ? (
                  <div className="flex flex-col gap-3">
                    <button onClick={() => saveMosqueInfo(true)} className="w-full py-4 bg-brand-600 hover:bg-brand-700 text-white rounded-2xl text-sm font-bold shadow-lg uppercase tracking-widest">Save & Add Timings</button>
                    <button onClick={() => setActiveModal(null)} className="w-full py-3 bg-transparent text-gray-500 text-xs font-bold uppercase tracking-widest">Cancel</button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="flex gap-3">
                      <button onClick={() => saveMosqueInfo(false)} className="flex-1 py-3.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 rounded-2xl text-[11px] font-bold uppercase tracking-wider">Save & Exit</button>
                      <button onClick={() => saveMosqueInfo(true)} className="flex-[1.5] py-3.5 bg-brand-600 text-white rounded-2xl text-[11px] font-bold uppercase tracking-wider shadow-lg">Edit Timings</button>
                    </div>
                    <button onClick={() => setActiveModal(null)} className="w-full py-2 bg-transparent text-gray-400 text-[10px] font-bold uppercase tracking-widest hover:text-gray-600 transition-colors">Cancel</button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Contact Us Modal */}
        {activeModal === 'contact' && (
            <div onClick={(e) => handleModalClickOutside(e, 'contact')} className="fixed inset-0 z-[110] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
                <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-sm p-6 shadow-2xl animate-card font-sans">
                    <div className="flex justify-between items-center mb-5"><h3 className="text-lg font-serif font-bold dark:text-white">Contact Us</h3><button onClick={() => setActiveModal(null)} className="text-gray-400"><i className="fas fa-times"></i></button></div>
                    <div className="space-y-4">
                        <input type="text" value={contactForm.name} onChange={e=>setContactForm({...contactForm, name: e.target.value})} className="w-full bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-xs outline-none text-gray-900 dark:text-white" placeholder="Name (Optional)" />
                        <input type="text" value={contactForm.email} onChange={e=>setContactForm({...contactForm, email: e.target.value})} className="w-full bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-xs outline-none text-gray-900 dark:text-white" placeholder="Email/Phone No. (Optional)" />
                        <textarea rows="4" value={contactForm.message} onChange={e=>setContactForm({...contactForm, message: e.target.value})} className="w-full bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-xs outline-none text-gray-900 dark:text-white" placeholder="Your Message (Required)"></textarea>
                        <input type="text" className="hidden" value={contactForm.honeypot} onChange={e=>setContactForm({...contactForm, honeypot: e.target.value})} />
                    </div>
                    <button onClick={submitContactForm} className="w-full mt-6 py-3 bg-brand-600 text-white rounded-xl text-sm font-bold shadow-lg uppercase">Send Message</button>
                </div>
            </div>
        )}

        {/* Access Denied Modal */}
        {activeModal === 'accessDenied' && (
            <div onClick={(e) => handleModalClickOutside(e, 'accessDenied')} className="fixed inset-0 z-[90] bg-black/70 backdrop-blur-sm flex items-center justify-center p-6 text-center">
                <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-xs p-6 shadow-2xl animate-card font-sans">
                    <div className="w-12 h-12 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4"><i className="fas fa-lock"></i></div>
                    <h3 className="text-lg font-serif font-bold mb-2 text-gray-800 dark:text-white">Restricted Access</h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mb-6">To get editing permissions, contact the admin at our <a href="https://chat.whatsapp.com/D5sJdbLNsNGGwzXNW7vNmL" target="_blank" rel="noreferrer" className="text-brand-600 underline font-bold">WhatsApp group.</a></p>
                    <button onClick={() => setActiveModal(null)} className="w-full py-3 bg-gray-100 dark:bg-gray-700 dark:text-gray-200 rounded-xl text-xs font-bold uppercase">Close</button>
                 </div>
            </div>
        )}

        {/* Toast */}
        <div className={`fixed bottom-[90px] left-1/2 transform -translate-x-1/2 bg-gray-900 text-white px-5 py-2.5 rounded-full text-xs font-bold shadow-2xl transition-all duration-300 z-[120] pointer-events-none font-sans ${toastVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
            <i className="fas fa-check-circle text-brand-400 mr-2"></i><span>{toastMessage}</span>
        </div>
    </div>
  );
}
