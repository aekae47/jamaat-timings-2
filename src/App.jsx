import React, { useState, useEffect, useRef, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import { 
  getFirestore, collection, doc, setDoc, updateDoc, deleteDoc, addDoc, 
  onSnapshot, enableIndexedDbPersistence, serverTimestamp, arrayUnion 
} from 'firebase/firestore';
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, signOut } from 'firebase/auth';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { APIProvider, Map, AdvancedMarker, Pin } from '@vis.gl/react-google-maps';

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
  const [installPrompt, setInstallPrompt] = useState(null);
  const [viewMode, setViewMode] = useState('next');
  const [currentList, setCurrentList] = useState('Nearby'); // Nearby is now default
  const [searchQuery, setSearchQuery] = useState('');
  const [mosques, setMosques] = useState([]);
  
  // New Location & Map State
  const [userLocation, setUserLocation] = useState(null);
  const [locStatus, setLocStatus] = useState('prompt'); // prompt, granted, denied
  const [mapExpanded, setMapExpanded] = useState(false);
  const [sortBy, setSortBy] = useState('time'); // time, distance
  const [visibleLimit, setVisibleLimit] = useState(20);

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

  const [mosqueFormData, setMosqueFormData] = useState({ name: '', area: '', locationLink: '', address: '' });
  const [timingFormData, setTimingFormData] = useState({});
  const [newCityInput, setNewCityInput] = useState('');
  const [newListInput, setNewListInput] = useState('');
  const [contactForm, setContactForm] = useState({ name: '', email: '', message: '', honeypot: '' });
  const [editingList, setEditingList] = useState(null);
  const [editListInput, setEditListInput] = useState('');
  
  // --- LOCATION & GEOCODING ---
  const requestLocation = () => {
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const coords = { lat: position.coords.latitude, lng: position.coords.longitude };
          setUserLocation(coords);
          setLocStatus('granted');
          
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
        () => { setLocStatus('denied'); setCurrentList('All'); }
      );
    }
  };

  useEffect(() => { requestLocation(); }, []);

  // Haversine Distance Formula
  const getDistance = (lat1, lon1, lat2, lon2) => {
    if(!lat1 || !lon1 || !lat2 || !lon2) return Infinity;
    const R = 6371; // Earth's radius in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c; // Distance in km
  };

  useEffect(() => {
    const handler = (e) => { e.preventDefault(); setInstallPrompt(e); };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstallClick = async () => {};

  useEffect(() => {
    const localLists = localStorage.getItem('personalLists');
    const localOrder = localStorage.getItem('customOrder');
    
    if (localLists) setPersonalLists(JSON.parse(localLists));
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
            setAvailableCities(prev => new Set([...prev, ...docSnap.data().cities]));
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
    const updatedDay = new Date(updatedDate.getFullYear(), updatedDate.getMonth(), updatedDate.getDate());
    const nowDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const diffTime = nowDay - updatedDay;
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return 'Today';
    return `${diffDays}d ago`;
  };

  const isTimingPredicted = (iso) => {
    if(!iso) return false;
    const diffTime = new Date() - new Date(iso);
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    return diffDays > 30;
  };

  const getTimeRemaining = (timeStr, pid = null) => {
      if(!timeStr || pid === 'eidFitr' || pid === 'eidAdha') return '';
      const now = new Date(); const [h, m] = timeStr.split(':').map(Number);
      const target = new Date(); target.setHours(h, m, 0, 0);
      if (pid === 'fajr' && now.getHours() > 20) target.setDate(target.getDate() + 1);
      if (target < now) return '(Passed)';
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

  const saveMosqueInfo = async (goToTimings = false) => {
      if (userRole !== 'volunteer' && userRole !== 'admin') return;
      if(!mosqueFormData.name) return alert("Name required");
      if(!mosqueFormData.locationLink) return alert("Google Maps Link is required to extract coordinates.");

      let extractedCoords = null;
      try {
          // Trigger Cloud Function to extract coords
          const { data } = await extractLocationCall({ url: mosqueFormData.locationLink });
          if (data.lat && data.lng) extractedCoords = { lat: data.lat, lng: data.lng };
      } catch (e) {
          console.error("Failed to extract location", e);
          if(!window.confirm("Failed to extract map coordinates from the link. Save anyway?")) return;
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
              
              // Push old timing to history array if it changed
              if (updatedTimings[p.id] && updatedTimings[p.id].time !== formData.time) {
                  updatedHistory.push({
                      prayer: p.id,
                      time: updatedTimings[p.id].time,
                      replacedAt: nowISO
                  });
              }

              updatedTimings[p.id] = { 
                  time: formData.time, 
                  fixed: formData.fixed || false,
                  lastUpdated: formData.fixed ? null : finalDate
              }; 
          } else if (formData && formData.time === '') {
              delete updatedTimings[p.id];
          }
      });

      await updateDoc(doc(db, 'mosques', selectedMosqueId), { 
          timings: updatedTimings,
          history: updatedHistory 
      }); 
      setActiveModal(null); 
      showToastMsg('Saved');
  };

  const deleteMosque = async () => { 
      if(window.confirm("Delete this masjid?")) { await deleteDoc(doc(db, 'mosques', selectedMosqueId));
      setActiveModal(null); showToastMsg('Deleted'); } 
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

  // Centralized Sorting & Filtering Engine
  const activeMosques = useMemo(() => {
      let filtered = mosques.filter(m => (m.city || 'Hyderabad') === appSettings.city);
      
      // Calculate distances if location is available
      if (userLocation) {
          filtered = filtered.map(m => {
              if (m.coordinates) {
                  return { ...m, distance: getDistance(userLocation.lat, userLocation.lng, m.coordinates.lat, m.coordinates.lng) };
              }
              return { ...m, distance: Infinity };
          });
      }

      if (currentList === 'Jummah') {
          filtered = filtered.filter(m => m.timings?.jumma?.time);
      } else if (currentList === 'Nearby') {
          filtered = filtered.filter(m => m.distance && m.distance <= 4); // 4km radius
      } else if (currentList !== 'All') { 
          const list = personalLists[currentList] || []; 
          filtered = filtered.filter(m => list.includes(m.id)); 
      }

      if (searchQuery) { 
          const lowerQ = searchQuery.toLowerCase();
          filtered = filtered.filter(m => m.name.toLowerCase().includes(lowerQ) || m.area.toLowerCase().includes(lowerQ)); 
      }

      // Sort Engine
      filtered.sort((a, b) => {
          if (currentList === 'Nearby' && sortBy === 'distance') return (a.distance || 0) - (b.distance || 0);
          
          if (viewMode === 'next' && currentTargetPrayer) {
              const target = currentList === 'Jummah' ? 'jumma' : currentTargetPrayer;
              const timeA = a.timings?.[target]?.time || "99:99";
              const timeB = b.timings?.[target]?.time || "99:99";
              return timeA.localeCompare(timeB);
          }

          // Fallback to custom order
          const idxA = customOrder.indexOf(a.id); const idxB = customOrder.indexOf(b.id);
          if (idxA === -1 && idxB === -1) return (b.order || 0) - (a.order || 0);
          if (idxA === -1) return 1; if (idxB === -1) return -1; return idxA - idxB;
      });

      return filtered.slice(0, currentList === 'Jummah' ? visibleLimit * 2 : visibleLimit);
  }, [mosques, appSettings.city, currentList, searchQuery, customOrder, userLocation, sortBy, visibleLimit, viewMode, currentTargetPrayer]);

  const selectedMosqueDetail = mosques.find(m => m.id === selectedMosqueId);

  // --- RENDER HELPERS ---
  const renderNextPrayerMode = () => {
      let startKey = currentTargetPrayer === 'jumma' ? 'zuhr' : currentTargetPrayer; 
      let idx = sequenceOrder.indexOf(startKey);
      let sequence = []; 
      for(let i=0; i<4; i++) { 
          let pid = sequenceOrder[(idx + i) % 4];
          if (pid === 'zuhr' && isFriday) pid = 'jumma'; 
          sequence.push(pid);
      }

      const pObj = currentList === 'Jummah' ? prayersList.find(p=>p.id==='jumma') : prayersList.find(p=>p.id===sequence[0]);
      const currentTimingId = currentList === 'Jummah' ? 'jumma' : sequence[0];

      if (!activeMosques.length) return <div className="text-center mt-10 text-gray-400 text-xs font-bold uppercase tracking-widest">No Masājid found.</div>;

      return (
          <div className="pb-10">
              <div className="mb-2 flex items-center justify-between px-1">
                  <div className="flex items-center" dir="ltr">
                      <i className={`fas ${pObj.icon} text-xs text-brand-500`}></i>
                      <h3 className="ml-2 text-xs font-sans font-bold uppercase tracking-widest text-brand-600 dark:text-brand-400">{pObj.name}</h3>
                      <span className="mx-2 h-4 w-px bg-brand-400 dark:bg-brand-500"></span>
                      <span className="font-arabic text-md text-brand-600 dark:text-brand-400" dir="rtl">{pObj.arabic}</span>
                  </div>
                  {currentList === 'Nearby' && (
                      <button onClick={() => setSortBy(sortBy === 'time' ? 'distance' : 'time')} className="text-[10px] font-bold text-gray-500 bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded">
                          Sort by {sortBy === 'time' ? 'Distance' : 'Time'} <i className="fas fa-sort"></i>
                      </button>
                  )}
              </div>

              {activeMosques.map(m => {
                  const t = m.timings[currentTimingId]; 
                  if(!t?.time) return null;
                  const [h, mins] = t.time.split(':'); 
                  const rem = getTimeRemaining(t.time, currentTimingId); 
                  const passed = rem === '(Passed)';
                  const predicted = isTimingPredicted(t.lastUpdated) && !t.fixed;

                  return (
                      <div key={m.id} onClick={() => { setSelectedMosqueId(m.id); setActiveModal('detail'); }} className={`cursor-pointer flex justify-between items-center bg-white dark:bg-gray-800 px-4 py-2.5 rounded-xl shadow-sm border-l-[3px] ${passed?'border-gray-300 opacity-60':'border-brand-500'} mb-2 transition-all`}>
                          <div className="flex-1 flex items-center gap-3">
                              <i className="fas fa-mosque text-sm text-gray-400"></i>
                              <div>
                                  <h4 className="font-sans font-bold text-sm dark:text-white leading-tight">{m.name}</h4>
                                  <p className="font-bold text-[10px] text-gray-500 flex items-center gap-2">
                                      {m.area}
                                      {m.distance && <span className="text-[9px] bg-brand-50 dark:bg-brand-900/30 text-brand-600 px-1 py-0.5 rounded">{m.distance.toFixed(1)} km</span>}
                                  </p>
                              </div>
                          </div>
                          <div className="text-right flex flex-col items-end leading-none tabular-nums">
                              <div className="font-anonymous font-bold text-xl text-gray-900 dark:text-white tracking-tight relative">
                                  {parseInt(h) % 12 || 12}:{mins}
                                  <span className="text-[9px] ml-1 font-sans font-medium text-gray-500">{h >= 12 ? 'PM' : 'AM'}</span>
                                  {predicted && <span className="text-amber-500 absolute -top-1 -right-2 text-[10px]" title="Predicted Timing">*</span>}
                              </div>
                              <div className={`mt-1 text-[9px] font-semibold font-sans px-2 py-0.5 rounded-md ${passed ? 'text-gray-400 bg-gray-100' : 'text-brand-700 bg-brand-100'}`}>
                                  {rem}
                              </div>
                          </div>
                      </div>
                  );
              })}
              
              {visibleLimit <= activeMosques.length && (
                  <button onClick={() => setVisibleLimit(prev => prev + 20)} className="w-full py-2 mt-2 bg-gray-100 dark:bg-gray-800 text-gray-500 text-[10px] font-bold uppercase rounded-xl">Load More</button>
              )}
          </div>
      );
  };

  const renderListMode = () => {
      if(!activeMosques.length) return <div className="text-center mt-10 text-gray-400 text-xs font-bold uppercase tracking-widest">No Masājid found.</div>;
      return (
          <div className="pb-10 space-y-3">
              {currentList === 'Nearby' && (
                  <div className="flex justify-end mb-2">
                      <button onClick={() => setSortBy(sortBy === 'time' ? 'distance' : 'time')} className="text-[10px] font-bold text-gray-500 bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded">
                          Sort by {sortBy === 'time' ? 'Distance' : 'Time'} <i className="fas fa-sort"></i>
                      </button>
                  </div>
              )}
              {activeMosques.map(m => (
                  <div key={m.id} onClick={() => { setSelectedMosqueId(m.id); setActiveModal('detail'); }} className="bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-sm border-l-[3px] border-brand-500 cursor-pointer flex items-center justify-between">
                      <div className="flex-1 flex items-start gap-3">
                          <i className="fas fa-mosque text-brand-500 mt-1"></i>
                          <div>
                              <h2 className="font-sans font-bold text-sm text-gray-800 dark:text-white leading-tight">{m.name}</h2>
                              <p className="font-bold text-[10px] text-gray-400 flex items-center gap-2 mt-0.5">
                                  {m.area}
                                  {m.distance && <span className="bg-gray-100 dark:bg-gray-700 px-1 py-0.5 rounded text-gray-500">{m.distance.toFixed(1)} km</span>}
                              </p>
                          </div>
                      </div>
                      <i className="fas fa-chevron-right text-gray-300 text-xs"></i>
                  </div>
              ))}
              {visibleLimit <= activeMosques.length && (
                  <button onClick={() => setVisibleLimit(prev => prev + 20)} className="w-full py-2 mt-2 bg-gray-100 dark:bg-gray-800 text-gray-500 text-[10px] font-bold uppercase rounded-xl">Load More</button>
              )}
          </div>
      );
  };

  // --- MAIN RENDER ---
  return (
    <div className="bg-gray-50 dark:bg-gray-900 text-gray-800 dark:text-gray-100 font-sans transition-colors duration-200 h-screen overflow-hidden flex flex-col relative">
        
        {/* Sticky Location Banner */}
        {locStatus === 'denied' && (
            <div className="fixed top-[50px] w-full z-[45] bg-amber-50 border-b border-amber-200 text-amber-800 px-4 py-2 flex items-center justify-between shadow-sm cursor-pointer" onClick={() => alert("Please tap the 'Lock' icon in your browser URL bar and change Location permissions to 'Allow', then refresh.")}>
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
                <div className="w-8"></div>
            </div>
        </div>

        {/* Dynamic Split Layout Area */}
        <div className={`relative flex-1 flex flex-col w-full mt-[50px] ${locStatus === 'denied' ? 'mt-[85px]' : ''}`}>
            
            {/* Map Layer (Background) */}
            {(viewMode === 'next' || viewMode === 'list') && (
                <div className={`absolute top-0 w-full transition-all duration-500 ease-in-out ${mapExpanded ? 'h-full pb-[15vh]' : 'h-[45vh]'} ${locStatus === 'denied' ? 'grayscale opacity-30 pointer-events-none' : ''}`}>
                    <APIProvider apiKey={GOOGLE_MAPS_API_KEY}>
                        <Map 
                            defaultZoom={13} 
                            defaultCenter={userLocation || { lat: 17.3850, lng: 78.4867 }}
                            mapId={appSettings.theme === 'dark' ? "8f8b89691456a090" : "roadmap"} // Fallback IDs or handle inline styles via options if using legacy
                            disableDefaultUI={true}
                            gestureHandling={'greedy'}
                            onClick={() => setMapExpanded(true)}
                        >
                            {userLocation && (
                                <AdvancedMarker position={userLocation}>
                                    <div className="w-4 h-4 bg-blue-500 border-2 border-white rounded-full shadow-lg pulse-ring"></div>
                                </AdvancedMarker>
                            )}
                            {activeMosques.map(m => m.coordinates && (
                                <AdvancedMarker key={m.id} position={m.coordinates} onClick={() => { setSelectedMosqueId(m.id); setActiveModal('detail'); }}>
                                    <Pin background={'#10b981'} borderColor={'#065f46'} glyphColor={'#fff'} />
                                </AdvancedMarker>
                            ))}
                        </Map>
                    </APIProvider>
                </div>
            )}

            {/* Bottom Sheet Layer */}
            {(viewMode === 'next' || viewMode === 'list') && (
                <div className={`absolute bottom-0 w-full bg-white/95 dark:bg-gray-900/95 backdrop-blur-xl border-t border-gray-200 dark:border-gray-800 shadow-[0_-10px_40px_rgba(0,0,0,0.15)] rounded-t-3xl transition-all duration-500 ease-in-out flex flex-col z-30 pb-[70px] ${mapExpanded ? 'h-[25vh]' : 'h-[65vh]'}`}>
                    
                    {/* Drag Handle */}
                    <div className="w-full py-3 flex justify-center cursor-pointer" onClick={() => setMapExpanded(!mapExpanded)}>
                        <div className="w-12 h-1.5 bg-gray-300 dark:bg-gray-600 rounded-full"></div>
                    </div>

                    {/* Tab Navigation */}
                    <div className="w-full px-4 pb-2">
                        <div className="flex overflow-x-auto no-scrollbar gap-2 font-sans py-1">
                            {['Nearby', 'All', 'Favorites', ...Object.keys(personalLists).filter(l => !['Favorites','Home','Work'].includes(l))].map(list => (
                                <button key={list} onClick={() => { setCurrentList(list); setVisibleLimit(20); setMapExpanded(false); }} className={`px-4 py-1.5 rounded-full text-[11px] font-bold transition-all whitespace-nowrap border ${currentList === list ? 'bg-brand-600 text-white border-brand-600 shadow-md' : 'bg-gray-100 dark:bg-gray-800 text-gray-500 border-transparent dark:border-gray-700'}`}>
                                    {list}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Content Area */}
                    <div className="flex-1 overflow-y-auto px-4 py-2" onClick={() => setMapExpanded(false)}>
                        {viewMode === 'next' && renderNextPrayerMode()}
                        {viewMode === 'list' && renderListMode()}
                    </div>
                </div>
            )}

            {/* Info Mode Override */}
            {viewMode === 'info' && (
                <div className="flex-1 overflow-y-auto px-4 pt-6 pb-24 z-30 bg-gray-50 dark:bg-gray-900">
                    <div className="animate-card max-w-sm mx-auto space-y-8">
                        <div className="flex justify-center"><img src="assets/bismillah-jot1.png" className="h-16 w-auto opacity-80 dark:invert" alt="Bismillah" /></div>
                        <div className="space-y-3 font-sans">
                            <h3 className="text-[10px] font-bold uppercase text-gray-400 tracking-widest ml-1">Frequently Asked Questions</h3>
                            <FAQItem q="Why are there no Maghrib timings?" a="Maghrib timings are usually the same around sunset." />
                            <FAQItem q="How do I add a missing Masjid?" a="Join our WhatsApp group to contribute!" />
                        </div>
                    </div>
                </div>
            )}
        </div>

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

        {/* Details Modal - Render basic info similarly, add predicted asterisk visual logic if rendering times */}
        {activeModal === 'detail' && selectedMosqueDetail && (
          <div onClick={(e) => handleModalClickOutside(e, 'detail')} className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white dark:bg-gray-900 rounded-2xl w-full max-w-sm max-h-[85vh] shadow-2xl flex flex-col animate-card overflow-hidden border border-gray-100 dark:border-gray-800">
              <div className="p-5 border-b border-gray-100 dark:border-gray-800 bg-gray-50/70 dark:bg-gray-900 flex justify-between items-start">
                <div className="flex items-start gap-3">
                  <i className="fas fa-mosque text-brand-600 text-xl mt-1"></i>
                  <div>
                    <h2 className="text-xl font-sans font-bold text-gray-900 dark:text-white leading-tight">{selectedMosqueDetail.name}</h2>
                    <p className="text-xs font-bold text-gray-500 mt-1">{selectedMosqueDetail.area}</p>
                  </div>
                </div>
                <button onClick={() => setActiveModal(null)} className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-500"><i className="fas fa-times"></i></button>
              </div>
              <div className="flex-1 overflow-y-auto p-5 font-sans">
                <div className="space-y-2 cursor-pointer" onClick={() => tryAction('edit', () => openEditTiming(selectedMosqueId))}>
                  {['fajr', 'zuhr', 'asr', 'isha', 'jumma'].map(pid => {
                    const data = selectedMosqueDetail.timings[pid];
                    const hasTime = data && data.time;
                    const predicted = hasTime && isTimingPredicted(data.lastUpdated) && !data.fixed;
                    const pObj = prayersList.find(p => p.id === pid);
                    
                    return (
                      <div key={pid} className={`flex justify-between items-center p-3.5 rounded-xl mb-2 border ${!hasTime ? 'opacity-40' : ''} bg-gray-50 dark:bg-gray-800 border-gray-100 dark:border-gray-700`}>
                        <span className="flex items-center"><span className="font-bold text-sm text-gray-700 dark:text-gray-300 gap-1.5"><i className={`fas ${pObj.icon} text-xs w-4 text-gray-500`}></i> {pObj.name}</span></span>
                        <div className="text-right flex flex-col items-end leading-none tabular-nums">
                          <span className={`relative ${hasTime ? 'font-anonymous text-lg font-bold text-gray-900 dark:text-white' : 'text-[10px] text-gray-400 italic'}`} dangerouslySetInnerHTML={{ __html: hasTime ? formatTime12(data.time, pid) : 'NOT SET' }}></span>
                          {predicted && <span className="text-[8px] font-bold text-amber-500 mt-1">Predicted Timing *</span>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
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