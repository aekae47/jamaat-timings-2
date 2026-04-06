import React, { useState, useEffect } from 'react';
import { initializeApp } from 'firebase/app';
import { 
  getFirestore, collection, doc, setDoc, updateDoc, deleteDoc, addDoc, 
  onSnapshot, enableIndexedDbPersistence, serverTimestamp, arrayUnion 
} from 'firebase/firestore';
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, signOut } from 'firebase/auth';

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
const provider = new GoogleAuthProvider();

enableIndexedDbPersistence(db).catch(() => {});

// --- CONSTANTS ---
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
  const [currentList, setCurrentList] = useState('Favorites');
  const [searchQuery, setSearchQuery] = useState('');
  const [mosques, setMosques] = useState([]);
    
  const [appSettings, setAppSettings] = useState({
    ramadan: false, eidFitr: false, eidAdha: false, qiyam: false, lateIsha: false,
    theme: localStorage.getItem('theme') || 'light',
    city: localStorage.getItem('city') || 'Hyderabad'
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
  
  useEffect(() => {
    const handler = (e) => {
      e.preventDefault();
      setInstallPrompt(e); // Store the event to trigger later
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);
  
  const handleInstallClick = async () => {
  };
  

  useEffect(() => {
    const localLists = localStorage.getItem('personalLists');
    const localOrder = localStorage.getItem('customOrder');
	
	const defaultStructure = { Favorites: [], Home: [], Work: [] };
	
    if (localLists) {
        const parsed = JSON.parse(localLists);
        setPersonalLists(parsed);
        if (parsed.Favorites && parsed.Favorites.length === 0) {
        setCurrentList('All');
    }
} else {
    // If no local storage exists at all, default to All
    setCurrentList('All');

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
      } else {
        setUserRole('public');
      }
    });

    const unsubSettings = onSnapshot(doc(db, 'settings', 'global_modes'), (docSnap) => {
        if (docSnap.exists()) setAppSettings(prev => ({ ...prev, ...docSnap.data() }));
    });

        const unsubLocations = onSnapshot(doc(db, 'settings', 'locations'), (docSnap) => {
        if (docSnap.exists() && docSnap.data().cities) {
            // ✅ BUG FIX: Merge 'Hyderabad' with whatever comes from the database
            setAvailableCities(new Set(['Hyderabad', ...docSnap.data().cities]));
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
      if (currentUser) setDoc(doc(db, 'users', currentUser.uid), { personalLists: newLists, customOrder: newOrder || customOrder }, { merge: true });
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
  
  const deletePersonalList = (listName) => {
      // 1. Define the protected default lists
      const DEFAULT_LISTS = ['Favorites', 'Home', 'Work'];
      
      // 2. Immediate exit if it's a default list
      if (DEFAULT_LISTS.includes(listName)) return;

      // 3. Browser confirmation dialogue
      const confirmed = window.confirm(`Are you sure you want to delete the list "${listName}"? This cannot be undone.`);
      
      if (confirmed) {
          const newLists = { ...personalLists };
          delete newLists[listName];
          
          setPersonalLists(newLists); 
          saveUserData(newLists);
          
          // 4. Redirect user to 'All' if they were currently viewing the deleted list
          if (currentList === listName) {
              setCurrentList('All');
          }
          
          showToastMsg('List Deleted');
      }
  };

  const renamePersonalList = (oldName) => {
      const DEFAULT_LISTS = ['Favorites', 'Home', 'Work'];
      const newName = editListInput.trim();
      
      // If invalid, duplicate, or default list -> just cancel edit
      if (!newName || newName === oldName || personalLists[newName] || DEFAULT_LISTS.includes(oldName)) {
          setEditingList(null);
          return;
      }
      
      const newLists = { ...personalLists };
      newLists[newName] = newLists[oldName]; // Copy IDs to new name
      delete newLists[oldName]; // Remove old list
      
      setPersonalLists(newLists); 
      saveUserData(newLists);
      setEditingList(null);
      if (currentList === oldName) setCurrentList(newName);
  };

  const movePersonalOrder = (id, dir) => {
      let currentOrder = [...customOrder];
      if (!currentOrder.includes(id)) currentOrder = mosques.map(m => m.id);
      const idx = currentOrder.indexOf(id);
      const targetIdx = idx + dir;
      if (targetIdx >= 0 && targetIdx < currentOrder.length) {
          const temp = currentOrder[idx]; currentOrder[idx] = currentOrder[targetIdx]; currentOrder[targetIdx] = temp;
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

const saveMosqueInfo = async (goToTimings = false) => {
      if (userRole !== 'volunteer' && userRole !== 'admin') return;
      if(!mosqueFormData.name) return alert("Name required");
      
      const data = { ...mosqueFormData, city: appSettings.city };
      let savedId = selectedMosqueId; 
      let defaultDbTimings = null;

      if (selectedMosqueId) {
          await updateDoc(doc(db, 'mosques', selectedMosqueId), data); 
      } else { 
          data.order = Date.now(); 
          
          // Seed the database immediately with defaults
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
      
      if (goToTimings) {
          // Pass the defaultDbTimings directly so we don't have to wait for state to update
          openEditTiming(savedId, defaultDbTimings); 
      } else {
          setActiveModal(null);
      }
  };

  const saveTimings = async () => {
      if (userRole !== 'volunteer' && userRole !== 'admin') return;
      const m = mosques.find(x => x.id === selectedMosqueId);
      if (!m) return; 

      let updated = { ...m.timings };
      const nowISO = new Date().toISOString();

      [...prayersList, ...specialPrayersList].forEach(p => { 
          const formData = timingFormData[p.id];
          
          if (formData && formData.time) {
              const finalDate = formData.date ? new Date(formData.date).toISOString() : nowISO;
              updated[p.id] = { 
                  time: formData.time, 
                  fixed: formData.fixed || false,
                  lastUpdated: formData.fixed ? null : finalDate
              }; 
          } else if (formData && formData.time === '') {
              // ✅ BUG FIX: If time is explicitly cleared, delete it from the payload
              delete updated[p.id];
          }
      });

      await updateDoc(doc(db, 'mosques', selectedMosqueId), { timings: updated }); 
      setActiveModal(null); 
      showToastMsg('Saved');
  };



  const deleteMosque = async () => { 
      if(window.confirm("Delete this masjid?")) { await deleteDoc(doc(db, 'mosques', selectedMosqueId)); setActiveModal(null); showToastMsg('Deleted'); } 
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
      
      // m might be undefined right after creation due to async state updates
      const m = mosques.find(x => x.id === id);
      
      const DEFAULT_PRAYER_TIMES = {
          fajr: "05:15",
          zuhr: "13:30",
          asr: "17:15",
          isha: "20:30",
          jumma: "13:30"
      };

      const initTimings = {};
      const today = new Date().toISOString().split('T')[0];
      
      // Use freshTimings if passed (new mosque), otherwise existing state, otherwise empty
      const sourceTimings = freshTimings || m?.timings || {};

      [...prayersList, ...specialPrayersList].forEach(p => {
          const existingTime = sourceTimings[p.id]?.time;
          const isFixed = sourceTimings[p.id]?.fixed || false;
          const lastUpdated = sourceTimings[p.id]?.lastUpdated 
              ? sourceTimings[p.id].lastUpdated.split('T')[0] 
              : today;

          initTimings[p.id] = { 
              // Priority: 1. Existing Data | 2. Default Values | 3. Empty String
              time: existingTime || DEFAULT_PRAYER_TIMES[p.id] || '', 
              fixed: isFixed, 
              date: lastUpdated 
          };
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

  const getFilteredAndSortedMosques = () => {
      let filtered = mosques.filter(m => (m.city || 'Hyderabad') === appSettings.city);
      if (currentList === 'Jummah') filtered = filtered.filter(m => m.timings?.jumma?.time);
      else if (currentList !== 'All') { const list = personalLists[currentList] || []; filtered = filtered.filter(m => list.includes(m.id)); }
      if (searchQuery) { const lowerQ = searchQuery.toLowerCase(); filtered = filtered.filter(m => m.name.toLowerCase().includes(lowerQ) || m.area.toLowerCase().includes(lowerQ)); }
      filtered.sort((a, b) => {
          const idxA = customOrder.indexOf(a.id); const idxB = customOrder.indexOf(b.id);
          if (idxA === -1 && idxB === -1) return (b.order || 0) - (a.order || 0);
          if (idxA === -1) return 1; if (idxB === -1) return -1; return idxA - idxB;
      });
      return filtered;
  };

  const activeMosques = getFilteredAndSortedMosques();
  const selectedMosqueDetail = mosques.find(m => m.id === selectedMosqueId);

  // --- RENDER HELPERS ---
  const renderNextPrayerMode = () => {
      if (currentList === 'Jummah') {
          const jummaList = [...activeMosques].sort((a, b) => (a.timings?.jumma?.time || "99:99").localeCompare(b.timings?.jumma?.time || "99:99"));
          if (!jummaList.length) return <div className="text-center mt-20 text-gray-400 text-xs font-bold uppercase tracking-widest">No Jummah timings found.</div>;
          return (
              <>
                  <div className="mt-4 mb-2 flex items-center gap-2 px-1"><i className="fas fa-users text-xs text-emerald-600"></i><h3 className="text-xs font-sans font-bold text-emerald-700 dark:text-emerald-400 uppercase tracking-widest">Jummah Timings</h3></div>
                  {jummaList.map(m => {
                      const t = m.timings.jumma.time; const [h, mins] = t.split(':');
                      return (
                          <div key={m.id} onClick={() => { setSelectedMosqueId(m.id); setActiveModal('detail'); }} className="flex justify-between items-center bg-white dark:bg-gray-800 px-4 py-2.5 rounded-xl shadow-sm border-l-[3px] border-emerald-600 mb-1 animate-card cursor-pointer">
                              <div className="flex-1 mr-4 flex items-center gap-2"><i className="fas fa-mosque text-[10px] text-emerald-500/30"></i><div><h4 className="font-sans font-bold text-sm dark:text-white leading-tight">{m.name}</h4><p className="font-bold text-[9px] text-gray-400 font-medium">{m.area}</p></div></div>
                              <div className="text-right font-anonymous font-bold text-lg text-emerald-700 dark:text-emerald-400">{parseInt(h)%12||12}:{mins}<span className="text-[9px] ml-1 font-sans font-normal">{h>=12?'PM':'AM'}</span></div>
                          </div>
                      );
                  })}
              </>
          );
      }

      let startKey = currentTargetPrayer === 'jumma' ? 'zuhr' : currentTargetPrayer; 
      let idx = sequenceOrder.indexOf(startKey);
      let sequence = []; for(let i=0; i<4; i++) { let pid = sequenceOrder[(idx + i) % 4]; if (pid === 'zuhr' && isFriday) pid = 'jumma'; sequence.push(pid); }

      return (
          <>
              {['eidFitr', 'eidAdha'].map(eidKey => {
                  if(!appSettings[eidKey]) return null;
                  const sublist = activeMosques.filter(m => m.timings[eidKey]?.time).sort((a,b) => a.timings[eidKey].time.localeCompare(b.timings[eidKey].time));
                  if(!sublist.length) return null;
                  return (
                      <div key={eidKey}>
                          <div className="mt-6 mb-2 flex items-center gap-2 px-1"><i className="fas fa-star text-xs text-amber-500"></i><h3 className="text-xs font-sans font-bold text-amber-600 uppercase tracking-widest">{specialPrayersList.find(s=>s.id===eidKey).name}</h3></div>
                          {sublist.map(m => {
                              const [h, mins] = m.timings[eidKey].time.split(':');
                              return (
                                  <div key={m.id} onClick={() => { setSelectedMosqueId(m.id); setActiveModal('detail'); }} className="flex justify-between items-center bg-white dark:bg-gray-800 px-4 py-2.5 rounded-xl shadow-sm border-l-[3px] border-amber-500 mb-1 animate-card cursor-pointer">
                                      <div className="flex-1 mr-4 flex items-center gap-2"><i className="fas fa-mosque text-[10px] text-amber-400"></i><div><h4 className="font-sans font-bold text-sm dark:text-white leading-tight">{m.name}</h4><p className="text-[9px] text-gray-400">{m.area}</p></div></div>
                                      <div className="text-right font-anonymous font-bold text-lg dark:text-white">{parseInt(h)%12||12}:{mins}<span className="text-[9px] ml-1 font-sans font-normal">{h>=12?'PM':'AM'}</span></div>
                                  </div>
                              );
                          })}
                      </div>
                  );
              })}

              {sequence.map((pid, idx) => {
                  const sublist = activeMosques.filter(m => m.timings[pid]?.time).sort((a,b) => a.timings[pid].time.localeCompare(b.timings[pid].time));
                  if(!sublist.length) return null;
                  const pObj = prayersList.find(p=>p.id===pid);
                  return (
                      <div key={pid}>
                          <div className="mt-6 mb-2 flex items-center px-1" dir="ltr">
  <i
    className={`fas ${pObj.icon} text-xs ${
      idx === 0 ? "text-brand-500" : "text-gray-400"
    }`}
  ></i>

  <h3
    className={`ml-2 text-xs font-sans font-bold uppercase tracking-widest ${
      idx === 0
        ? "text-brand-600 dark:text-brand-400"
        : "text-gray-400"
    }`}
    dir="ltr"
  >
    {pObj.name}
  </h3>

  {/* Premium thin divider */}
  <span
    className={`mx-2 h-4 w-px ${
      idx === 0
        ? "bg-brand-400 dark:bg-brand-500"
        : "bg-gray-300 dark:bg-gray-600"
    }`}
  ></span>

  <span
    className={`font-arabic text-md ${
      idx === 0
        ? "text-brand-600 dark:text-brand-400"
        : "text-gray-400"
    }`}
    dir="rtl"
  >
    {pObj.arabic}
  </span>
</div>
                          {sublist.map(m => {
                              const t = m.timings[pid]; const [h, mins] = t.time.split(':'); 
                              const rem = idx === 0 ? getTimeRemaining(t.time, pid) : ''; const passed = rem === '(Time Passed)';
                              const taraweehData = (pid === 'isha' && appSettings.ramadan && m.timings['taraweeh']?.time) ? m.timings['taraweeh'].time : null;
                              return (
                                  <div key={m.id} onClick={() => { setSelectedMosqueId(m.id); setActiveModal('detail'); }} className={`cursor-pointer flex justify-between items-center bg-white dark:bg-gray-800 px-4 py-2.5 rounded-xl shadow-sm border-l-[3px] ${idx===0?(passed?'border-gray-300':'border-brand-500'):'border-gray-200'} mb-1 transition-all ${passed?'opacity-40 grayscale':''}`}>
                                      <div className="flex-1 flex items-center gap-2">
                                          <i className="fas fa-mosque text-[10px] text-gray-400"></i>
                                          <div>
                                              <h4 className="font-sans font-bold text-sm dark:text-white leading-tight">{m.name}</h4>
                                              <p className="font-bold text-[9px] text-gray-400 font-medium">{m.area}</p>
                                              {taraweehData && <span className="inline-block text-[8px] font-bold text-amber-800 dark:text-amber-100 mt-1 px-1.5 py-0.5 rounded bg-amber-400 dark:bg-amber-600 shadow-sm uppercase font-sans">Tarāweeḥ: <span className="font-anonymous">{taraweehData}</span> P</span>}
                                          </div>
                                      </div>
                                      <div className="text-right flex flex-col items-end leading-none tabular-nums">

  {/* Time */}
  <div className="font-anonymous font-bold text-lg text-gray-900 dark:text-white tracking-tight">
    {parseInt(h) % 12 || 12}:{mins}
    <span className="text-[9px] ml-1 font-sans font-medium text-gray-500 dark:text-gray-400">
      {h >= 12 ? 'PM' : 'AM'}
    </span>
  </div>

  {/* Days ago */}
  {t.lastUpdated && !t.fixed && (
    <div className="w-full text-center font-ptsans text-[9px] text-gray-400/80 dark:text-gray-500/80 -mt-1">
      {getRelativeTime(t.lastUpdated)}
    </div>
  )}

  {/* Remaining time badge */}
  {idx === 0 && (
    <div
      className={`mt-1 text-[9px] font-semibold font-sans px-2 py-0.5 rounded-md transition
      ${
        passed
          ? 'text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-gray-800'
          : 'text-brand-700 dark:text-brand-300 bg-brand-100 dark:bg-brand-900/40'
      }`}
    >
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
          </>
      );
  };

  const renderListMode = () => {
      if(!activeMosques.length) return <div className="text-center mt-20 text-gray-400 text-xs font-bold uppercase tracking-widest">No Masājid found.</div>;
      return activeMosques.map(m => {
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
                          <div><h2 className="font-sans font-bold text-sm text-gray-800 dark:text-white leading-tight">{m.name}</h2><p className="font-bold text-[10px] text-gray-400 font-medium font-sans">{m.area}</p></div>
                      </div>
                      <div className="flex items-center gap-1 bg-gray-50 dark:bg-gray-700/50 rounded-lg p-1">
                          <button onClick={() => movePersonalOrder(m.id, -1)} className="w-6 h-6 rounded flex items-center justify-center text-xs text-gray-400"><i className="fas fa-chevron-up"></i></button>
                          <button onClick={() => movePersonalOrder(m.id, 1)} className="w-6 h-6 rounded flex items-center justify-center text-xs text-gray-400"><i className="fas fa-chevron-down"></i></button>
                          <div className="w-px h-3 bg-gray-200 dark:bg-gray-600 mx-1"></div>
                          <button onClick={() => { setSelectedMosqueId(m.id); setActiveModal('personalList'); }} className="w-6 h-6 rounded flex items-center justify-center text-xs text-red-800"><i className="fas fa-heart"></i></button>
                          {(userRole==='admin'||userRole==='volunteer') && <button onClick={() => openMosqueModal(m.id)} className="w-6 h-6 text-brand-600 rounded flex items-center justify-center ml-1"><i className="fas fa-pencil-alt text-xs"></i></button>}
                      </div>
                  </div>
                  
                  <div className="grid grid-cols-5 gap-0.5 text-center border-t border-gray-50 dark:border-gray-700 pt-3 mb-3">
                      {prayersList.map(p => {
                          const t = m.timings[p.id]?.time; 
                          if(!t) return <div key={p.id} onClick={() => tryAction('edit',()=>openEditTiming(m.id))} className="opacity-30 cursor-pointer"><div className="font-sans text-[8px] font-bold text-brand-500/80 mb-1 flex flex-col items-center gap-0.5 uppercase"><i className={`fas ${p.icon} text-[10px]`}></i> {p.name.slice(0,5)}</div>-</div>;
                          const [h, mins] = t.split(':');
                          const taraweehData = (p.id === 'isha' && appSettings.ramadan && m.timings['taraweeh']?.time) ? m.timings['taraweeh'].time : null;
                          return (
                              <div key={p.id} onClick={() => tryAction('edit',()=>openEditTiming(m.id))} className="cursor-pointer py-1">
                                  <div className="text-[8px] font-bold font-sans text-brand-500/80 mb-1 flex flex-col items-center gap-0.5 uppercase"><i className={`fas ${p.icon} text-[10px]`}></i> {p.name.slice(0,5)}</div>
                                  <div className="font-anonymous text-sm font-bold dark:text-white">{parseInt(h)%12||12}:{mins}<span className="text-[7px] block font-sans font-normal">{h>=12?'PM':'AM'}</span></div>
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
      });
  };

  const shareMessageText = `السلام عليكم ورحمة الله وبركاته 🌙\n\n🌙 This Ramadān, stay connected to the Masjid — on time, every time.\n\nWe’re pleased to introduce Jamaat on Time — a simple and useful web app to help you keep track of jamāʿah timings across various masājid.\n\n✨ Features include:\n• 🕌 Jamāʿah timings for multiple masājid (including Jumuʿah)\n• 🌙 Tarāweeḥ details\n• 🎉 Eid prayer timings\n• ⭐ Add nearby masājid to your Favorites list\n• 🔎 Instantly search by area, masjid name, or timing\n• 📱 Easy access from your phone\n\n🔗 Access the web app here:\nhttps://bit.ly/JamaatOnTime\n\n📢 Join our WhatsApp group for updates & feedback:\nhttps://chat.whatsapp.com/D5sJdbLNsNGGwzXNW7vNmL\n\nIf you find it beneficial, please share it with your family and friends.\n\nجزاك الله خيرًا\nوالسلام عليكم ورحمة الله وبركاته 🌿`;
  const encodedMessage = encodeURIComponent(shareMessageText);

  // --- MAIN RENDER ---
  return (
    <div className="bg-gray-50 dark:bg-gray-900 text-gray-800 dark:text-gray-100 font-sans transition-colors duration-200 min-h-screen">
        
        {/* SIDEBAR OVERLAY */}
        <div onClick={() => setIsSidebarOpen(false)} className={`fixed inset-0 bg-black/50 z-[60] transition-opacity backdrop-blur-sm ${isSidebarOpen ? '' : 'hidden'}`}></div>
        
        {/* SIDEBAR */}
        <div className={`fixed top-0 left-0 h-full w-72 bg-white dark:bg-gray-800 shadow-2xl z-[70] transform ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'} transition-transform duration-300 ease-in-out p-6 flex flex-col`}>
            {/* Sidebar content unchanged from earlier... */}
            <div className="mb-6 pb-6 border-b border-gray-100 dark:border-gray-700">
                {currentUser ? (
                    <div>
                        <div className="flex items-center gap-3 mb-3">
                            <img src={currentUser.photoURL} alt="User" className="w-10 h-10 rounded-full border-2 border-brand-500" />
                            <div><p className="text-xs font-bold text-gray-800 dark:text-white truncate max-w-[140px]">{currentUser.displayName}</p><p className="text-[9px] font-bold uppercase tracking-wider text-brand-600 bg-brand-50 dark:bg-brand-900/30 px-1.5 py-0.5 rounded inline-block">{userRole}</p></div>
                        </div>
                        <button onClick={() => signOut(auth)} className="text-xs font-bold text-red-500 hover:text-red-700">Log Out</button>
                    </div>
                ) : (
                    <button onClick={() => signInWithPopup(auth, provider)} className="w-full flex items-center justify-center gap-2 py-3 bg-gray-900 text-white rounded-xl text-xs font-bold shadow-lg hover:bg-gray-800 transition-colors"><i className="fab fa-google"></i> Sign in to Sync</button>
                )}
            </div>
            <h2 className="text-2xl font-serif font-bold mb-1 text-brand-600 dark:text-brand-400">Settings</h2>
            <p className="text-xs text-gray-400 mb-8 uppercase tracking-widest font-sans">Preferences</p>
            <div className="space-y-6 flex-1">
<div className="bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl p-4 flex items-center justify-between">

  {/* Left side */}
  <div className="flex items-center gap-3">
    <div className="w-9 h-9 flex items-center justify-center rounded-lg bg-gray-200 dark:bg-gray-700 transition">
      <i
        className={`fas ${
          appSettings.theme === 'dark' ? 'fa-moon' : 'fa-sun'
        } text-gray-700 dark:text-gray-300`}
      ></i>
    </div>

    <div>
      <div className="font-semibold text-sm text-gray-800 dark:text-gray-200">
        Dark Mode
      </div>
      
    </div>
  </div>

  {/* Toggle */}
  <button
    onClick={toggleTheme}
    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-all duration-300
    ${
      appSettings.theme === 'dark'
        ? 'bg-brand-600 shadow-inner'
        : 'bg-gray-300 dark:bg-gray-600'
    }
    active:scale-95 active:brightness-95`}
  >
    {/* Knob */}
    <span
      className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-all duration-300
      ${
        appSettings.theme === 'dark'
          ? 'translate-x-6'
          : 'translate-x-1'
      }`}
    />
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
    <button 
        onClick={handleInstallClick}
        className="w-full mt-4 flex items-center justify-center gap-3 py-4 bg-brand-600 text-white rounded-2xl shadow-lg border-2 border-brand-500 animate-bounce"
    >
        <i className="fas fa-download"></i>
        <span className="text-xs font-bold uppercase tracking-wider">Install App</span>
    </button>
)}
        </div>

        {/* HEADER */}
        <div className={`fixed top-0 w-full z-40 bg-white/95 dark:bg-gray-800/95 backdrop-blur-md shadow-sm border-b border-gray-100 dark:border-gray-700 transition-all ${viewMode === 'next' ? (isFriday ? 'h-[138px]' : 'h-[115px]') : (viewMode === 'info' ? 'h-[50px]' : 'h-[95px]')}`}>
            <div className="flex flex-col items-center justify-center pt-2 pb-1 relative h-[50px]">
                <button onClick={() => setIsSidebarOpen(true)} className="absolute left-3 top-2.5 text-gray-500 hover:text-brand-600 w-8 h-8 flex items-center justify-center rounded-full transition-colors"><i className="fas fa-bars text-lg"></i></button>
                <h1 className="text-lg font-serif font-bold text-brand-600 dark:text-brand-400 tracking-tight">Jamaat on Time</h1>
                <p className="text-[9px] text-gray-400 font-medium -mt-0.5 font-sans">by @aekae47</p>
            </div>

            {viewMode === 'next' && (
                <div className="w-full pb-2">
                    <div className="flex flex-col items-center justify-center py-1 cursor-pointer" onClick={() => setActiveModal('city')}>
{(() => {
  const date = new Date();
  let h = date.getHours();
  const mins = String(date.getMinutes()).padStart(2, '0');
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;

  return (
    <div className="text-4xl font-anonymous font-bold text-gray-800 dark:text-white tracking-tight leading-none flex items-baseline tabular-nums">
      <span>{h}:{mins}</span>
      <span className="font-sans font-medium text-sm text-gray-500 dark:text-gray-400 ml-1">
        {ampm}
      </span>
    </div>
  );
})()}                        <div className="flex items-center gap-1.5 mt-0.5 text-gray-400 dark:text-gray-500 font-sans"><i className="fas fa-map-marker-alt text-[9px]"></i><span className="text-[10px] font-bold uppercase tracking-[0.2em]">{appSettings.city.toUpperCase()}</span></div>
                        {isFriday && <div className="mt-1 bg-emerald-50 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400 px-3 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-[0.15em] border border-emerald-100 dark:border-emerald-800/50 shadow-sm mx-auto w-fit font-sans">It's Friday! ✨</div>}
                    </div>
                </div>
            )}

            {(viewMode === 'list' || viewMode === 'next') && viewMode !== 'info' && (
                <div className={`px-4 pt-1 pb-2 ${viewMode === 'next' ? 'hidden' : ''}`}>
                    <div className="relative"><i className="fas fa-search absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 text-xs"></i><input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search Masājid..." className="w-full bg-gray-100 dark:bg-gray-700/50 border-none rounded-lg py-2 pl-9 pr-4 text-xs font-bold outline-none dark:text-white focus:ring-2 focus:ring-brand-500 font-sans" /></div>
                </div>
            )}
        </div>

        {/* MAIN CONTENT AREA */}
        <div style={{ paddingTop: viewMode === 'next' ? (isFriday ? '138px' : '115px') : (viewMode === 'info' ? '50px' : '95px') }} className="max-w-md mx-auto px-3">
            {viewMode !== 'info' && (
                <div className="w-full bg-transparent py-2">
                    <div className="flex overflow-x-auto no-scrollbar gap-2 font-sans">
                        {['All', 'Favorites', ...Object.keys(personalLists).filter(l => l !== 'Favorites')].map(list => (<button key={list} onClick={() => setCurrentList(list)} className={`px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all whitespace-nowrap border ${currentList === list ? 'bg-brand-600 text-white border-brand-600 shadow-md' : 'bg-white dark:bg-gray-700 text-gray-500 border-gray-200 dark:border-gray-600'}`}>{list}</button>))}
                        <button onClick={() => setCurrentList('Jummah')} className={`px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all whitespace-nowrap border ${currentList === 'Jummah' ? 'bg-emerald-800 text-white border-emerald-800 shadow-md' : 'bg-white dark:bg-gray-700 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800/50'}`}>Jummah</button>
                    </div>
                </div>
            )}

            <div className="pb-24 min-h-screen">
                {mosques.length === 0 ? (
                    <div className="text-center mt-32 text-gray-400 flex flex-col items-center"><i className="fas fa-circle-notch fa-spin text-2xl mb-3 text-brand-300"></i><p className="text-xs font-bold uppercase tracking-widest opacity-50 font-sans">Starting...</p></div>
                ) : (
                    <>
                        {viewMode === 'next' && renderNextPrayerMode()}
                        {viewMode === 'list' && renderListMode()}
                        {viewMode === 'info' && (
                            <div className="animate-card max-w-sm mx-auto pt-6 space-y-8 pb-10">
                                <div className="flex justify-center"><img src="assets/bismillah-jot1.png" className="h-16 w-auto opacity-80 dark:invert" alt="Bismillah" /></div>
                                <p className="text-center text-sm font-ptsans text-gray-600 dark:text-gray-300 leading-relaxed italic px-2 font-ptsans">"Alhamdulillāh, Allāh ﷻ has given us this opportunity to be of some use to the Ummah, by creating this tool. Our sole intention is to help our brethren to be more punctual in their jamāʿah prayers."</p>
                                
                                <div className="space-y-3 font-sans">
                                    <h3 className="text-[10px] font-bold uppercase text-gray-400 tracking-widest ml-1">Frequently Asked Questions</h3>
                                    <FAQItem q="Why are there no Maghrib timings?" a="Maghrib timings are usually the same in all the masājid around us, around sunset, and is not difficult for most people to be reminded. Hence for simplicity of the app, we haven't included them." />
                                    <FAQItem q="My nearby masjid timings are missing, what to do?" a="You can contribute to our timings database via our <a href='https://chat.whatsapp.com/D5sJdbLNsNGGwzXNW7vNmL' target='_blank' class='text-brand-600 underline'>WhatsApp group</a>." />
                                    <FAQItem q="How do I install this app?" a="On Android, just open the sidebar of this web app, and click on 'Install App', and drag the icon to your home screen." />
                                    <FAQItem q="How reliable are these timings?" a="These rely on contributions by volunteers. Most of them are reliable but some may be wrong. You can report wrong timings in our WhatsApp group." />
                                    <FAQItem q="Who has made this app?" a="Some well-wishers of the ummah, aided with the help of many volunteers has developed this." />
                                </div>

                                <div className="space-y-3 pt-4 font-sans"> 
								{installPrompt && (
    <button 
        onClick={handleInstallClick}
        className="flex items-center justify-center gap-3 w-full py-4 bg-brand-600 text-white rounded-2xl shadow-lg mb-4"
    >
        <i className="fas fa-mobile-alt text-xl"></i>
        <span className="text-sm font-bold uppercase tracking-wider">Install App</span>
    </button>
)}
                                    <a href="https://chat.whatsapp.com/D5sJdbLNsNGGwzXNW7vNmL" target="_blank" rel="noreferrer" className="flex items-center justify-center gap-3 w-full py-4 bg-[#075E54] text-white rounded-2xl shadow-lg hover:brightness-110 transition-all"><i className="fab fa-whatsapp text-xl"></i><span className="text-sm font-bold uppercase tracking-wider">Join WhatsApp Group</span></a>
                                    <button onClick={() => setActiveModal('contact')} className="flex items-center justify-center gap-3 w-full py-4 bg-gray-800 text-white rounded-2xl shadow-lg hover:brightness-110 transition-all"><i className="fas fa-envelope text-xl"></i><span className="text-sm font-bold uppercase tracking-wider">Contact Us</span></button>
                                    <a href={`https://wa.me/?text=${encodedMessage}`} target="_blank" rel="noreferrer" className="flex items-center justify-center gap-3 w-full py-4 bg-[#25D366] text-white rounded-2xl shadow-lg hover:brightness-110 transition-all"><i className="fab fa-whatsapp text-xl"></i><span className="text-sm font-bold uppercase tracking-wider">Share on WhatsApp</span></a>
                                </div>
                                <div className="pt-8 pb-4 text-center font-sans"><p className="text-[10px] font-medium text-gray-400 uppercase tracking-[0.2em]">Made with <span className="text-red-400 mx-0.5">♡</span> in Hyderabad, India</p></div>
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>

        {/* FLOATING ACTION BUTTON */}
        {(userRole === 'admin' || userRole === 'volunteer') && viewMode !== 'info' && viewMode !== 'next' && (
            <button onClick={() => tryAction('edit', () => openMosqueModal(null))} className="fixed bottom-20 right-4 w-14 h-14 bg-brand-600 text-white rounded-full shadow-2xl flex items-center justify-center z-40 hover:scale-105"><i className="fas fa-plus text-xl"></i></button>
        )}

        {/* BOTTOM NAVIGATION */}
        <div className="fixed bottom-0 w-full bg-white/95 dark:bg-gray-800/95 backdrop-blur-md border-t border-gray-200 dark:border-gray-700 p-2 flex justify-around z-40 pb-4 font-sans">
            <button onClick={() => setViewMode('next')} className={`nav-btn w-16 group flex flex-col items-center justify-center ${viewMode === 'next' ? 'text-brand-600' : 'text-gray-400'}`}><i className="fas fa-clock text-lg mb-1"></i><span className="text-[10px] font-bold">Prayer</span></button>
            <button onClick={() => setViewMode('list')} className={`nav-btn w-16 group flex flex-col items-center justify-center ${viewMode === 'list' ? 'text-brand-600' : 'text-gray-400'}`}><i className="fas fa-mosque text-lg mb-1"></i><span className="text-[10px] font-bold">Masājid</span></button>
            <button onClick={() => setViewMode('info')} className={`nav-btn w-16 group flex flex-col items-center justify-center ${viewMode === 'info' ? 'text-brand-600' : 'text-gray-400'}`}><i className="fas fa-info-circle text-lg mb-1"></i><span className="text-[10px] font-bold">Info</span></button>
        </div>

        {/* --- MODALS --- */}
        
        {/* City Modal */}
        {activeModal === 'city' && (
            <div onClick={(e) => handleModalClickOutside(e, 'city')} className="fixed inset-0 z-[80] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
                <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-sm shadow-2xl animate-card overflow-hidden">
                    {/* City Modal Content */}
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
{/* Detail Modal */}
{activeModal === 'detail' && selectedMosqueDetail && (
  <div
    onClick={(e) => handleModalClickOutside(e, 'detail')}
    className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
  >
    <div className="bg-white dark:bg-gray-900 rounded-2xl w-full max-w-sm max-h-[85vh] shadow-2xl flex flex-col animate-card overflow-hidden border border-gray-100 dark:border-gray-800">

      {/* Header */}
      <div className="p-5 border-b border-gray-100 dark:border-gray-800 bg-gray-50/70 dark:bg-gray-900 flex justify-between items-start">
        <div className="flex items-start gap-3">
          <i className="fas fa-mosque text-brand-600 text-xl mt-1"></i>
          <div>
            <h2 className="text-xl font-sans font-bold text-gray-900 dark:text-white leading-tight">
              {selectedMosqueDetail.name}
            </h2>
            <p className="text-xs font-bold text-gray-500 dark:text-gray-400 mt-1 font-sans">
              {selectedMosqueDetail.area}
            </p>
          </div>
        </div>

        <div className="flex gap-2">
          {(userRole === 'admin' || userRole === 'volunteer') && (
            <button
              onClick={() => tryAction('edit', () => openMosqueModal(selectedMosqueId))}
              className="w-8 h-8 rounded-full bg-brand-50 dark:bg-brand-900/30 text-brand-600 dark:text-brand-400 flex items-center justify-center hover:bg-brand-100 dark:hover:bg-brand-800"
            >
              <i className="fas fa-pencil-alt text-xs"></i>
            </button>
          )}

          <button
            onClick={() => setActiveModal(null)}
            className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 flex items-center justify-center hover:bg-gray-200 dark:hover:bg-gray-700"
          >
            <i className="fas fa-times"></i>
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-5 font-sans">

        <div
          className="space-y-2 cursor-pointer"
          onClick={() => tryAction('edit', () => openEditTiming(selectedMosqueId))}
        >
          {['fajr', 'zuhr', 'asr', 'isha', 'jumma'].map(pid => {
            const data = selectedMosqueDetail.timings[pid];
            const hasTime = data && data.time;
            const pObj = prayersList.find(p => p.id === pid);

            const taraweeh =
              (pid === 'isha' &&
                appSettings.ramadan &&
                selectedMosqueDetail.timings['taraweeh']?.time)
                ? selectedMosqueDetail.timings['taraweeh'].time
                : null;

            return (
              <div
                key={pid}
                className={`flex justify-between items-center p-3.5 rounded-xl mb-2 border transition
                ${!hasTime ? 'opacity-40' : ''}
                bg-gray-50 dark:bg-gray-800
                border-gray-100 dark:border-gray-700`}
              >

                {/* Prayer Name */}
                <span className="flex items-center" dir="ltr">
                  <span className="font-bold text-sm text-gray-700 dark:text-gray-300 font-sans flex items-center gap-1.5">
                    <i className={`fas ${pObj.icon} text-xs w-4 text-gray-500 dark:text-gray-400`}></i>
                    {pObj.name}
                  </span>

                  <span className="mx-2 h-4 w-px bg-gray-300 dark:bg-gray-600"></span>

                  <span className="font-arabic text-sm font-bold text-gray-700 dark:text-gray-300 tracking-wide" dir="rtl">
                    {pObj.arabic}
                  </span>
                </span>

                <div className="text-right flex flex-col items-end leading-none tabular-nums">
  
  {/* Time */}
  <span
    className={
      hasTime
        ? 'font-anonymous text-lg font-bold text-gray-900 dark:text-white tracking-tight'
        : 'text-[10px] text-gray-400 dark:text-gray-500 italic'
    }
    dangerouslySetInnerHTML={{
      __html: hasTime
        ? formatTime12(data.time, pid)
        : '(Timing not entered)'
    }}
  ></span>

  {/* Days ago */}
  {hasTime && data.lastUpdated && !data.fixed && (
    <div className="w-full text-center font-ptsans text-[9px] text-gray-400/80 dark:text-gray-500/80 -mt-1">
      {getRelativeTime(data.lastUpdated)}
    </div>
  )}

{taraweeh && (
                    <div className="text-[9px] font-bold mt-1 px-2 py-0.5 rounded bg-amber-400/90 dark:bg-amber-500 text-black font-sans">
                      Tarāweeḥ:
                      <span className="font-anonymous ml-1">{taraweeh}</span> Pārahs
                    </div>
                  )}


</div>


              </div>
            );
          })}
        </div>

        {/* Notes */}
        {selectedMosqueDetail.address && (
          <div className="bg-gray-50 dark:bg-gray-800/60 rounded-xl p-4 border border-gray-100 dark:border-gray-700 mt-4 mb-2">
            <h4 className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase mb-2 tracking-wider">
              Notes
            </h4>
            <p className="text-xs text-gray-600 dark:text-gray-300 whitespace-pre-line leading-relaxed">
              {selectedMosqueDetail.address}
            </p>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="p-4 border-t border-gray-100 dark:border-gray-800 space-y-2 font-sans">

        {/* In the Detail Modal Footer */}
<button 
  onClick={() => {
      // Add to favorites if it isn't already there
      if (!personalLists.Favorites?.includes(selectedMosqueId)) {
          togglePersonalList('Favorites', selectedMosqueId);
      }
      setActiveModal('personalList');
  }}
  className={`flex items-center justify-center w-full font-bold py-3.5 rounded-2xl transition-all ${
      personalLists.Favorites?.includes(selectedMosqueDetail.id) 
      ? 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 border border-red-100 dark:border-red-900/50' 
      : 'bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-700'
  }`}
>
  <i className={`fas fa-heart mr-2 ${personalLists.Favorites?.includes(selectedMosqueDetail.id) ? 'text-red-500' : 'text-gray-400'}`}></i>
  {personalLists.Favorites?.includes(selectedMosqueDetail.id) ? 'Saved to Favorites' : 'Add to Favorites'}
</button>

        {selectedMosqueDetail.locationLink && (
          <a
            href={selectedMosqueDetail.locationLink}
            target="_blank"
            rel="noreferrer"
            className="flex items-center justify-center w-full bg-brand-600 hover:bg-brand-700 text-white font-bold py-3 rounded-xl shadow-lg transition"
          >
            <i className="fas fa-location-arrow mr-2"></i>
            Directions
          </a>
        )}
      </div>

    </div>
  </div>
)}

{/* Timings Edit Modal */}
{activeModal === 'timing' && selectedMosqueDetail && (
  <div
    onClick={(e) => handleModalClickOutside(e, 'timing')}
    className="fixed inset-0 z-50 bg-black/60 backdrop-blur-md flex items-center justify-center p-4"
  >
    <div className="bg-white dark:bg-gray-900 rounded-3xl w-full max-w-sm shadow-2xl animate-card max-h-[90vh] flex flex-col overflow-hidden border border-gray-100 dark:border-gray-800">
      
      {/* Header */}
      <div className="flex justify-between items-center px-5 py-4 border-b border-gray-100 dark:border-gray-800">
        <div>
          <h3 className="text-[10px] font-bold text-brand-600 uppercase tracking-widest mb-0.5">Prayer Schedule</h3>
          <p className="text-lg font-bold text-gray-900 dark:text-white leading-tight truncate max-w-[200px]">
            {selectedMosqueDetail.name}
          </p>
        </div>
        <button
          onClick={() => setActiveModal(null)}
          className="w-10 h-10 rounded-full bg-gray-50 dark:bg-gray-800 text-gray-500 flex items-center justify-center hover:bg-red-50 hover:text-red-500 transition-colors"
        >
          <i className="fas fa-times"></i>
        </button>
      </div>

      {/* Scrollable Content */}
      <div className="p-4 space-y-3 overflow-y-auto no-scrollbar">
        {(() => {
          const getToday = () => new Date().toISOString().split('T')[0];
          
          // Fallback timings if the mosque has no data yet
          const DEFAULT_TIMINGS = {
            fajar: "05:15",
            zohar: "13:30",
            asar: "17:15",
            maghrib: "18:45",
            isha: "20:30",
            jummah: "13:30",
            jummah_2: "14:15"
          };

          return prayersList.map((p) => {
            // Priority: 1. Form Data | 2. Default Timing | 3. Empty String
            const val = timingFormData[p.id]?.time || '';
            const isFixed = timingFormData[p.id]?.fixed || false;
            const updateDate = timingFormData[p.id]?.date || getToday();
            const hasValue = val !== '';

            return (
              <div
                key={p.id}
                className={`relative rounded-2xl border transition-all p-3 ${
                  hasValue 
                    ? 'border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-800/50' 
                    : 'border-dashed border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-transparent opacity-70'
                }`}
              >
                {/* Top Row: Names */}
                <div className="flex justify-between items-center mb-2.5 px-1">
                  <span className="text-xs font-bold text-gray-900 dark:text-gray-100 uppercase tracking-tight">
                    {p.name}
                  </span>
                  <span className="text-lg font-arabic text-brand-600 dark:text-brand-400">
                    {p.arabic}
                  </span>
                </div>

                {/* Main Interaction Row */}
                <div className="flex items-center gap-2">
                  
                  {/* Step Controls - Only visible if has value */}
                  <button
                    disabled={!hasValue}
                    onClick={() => {
                      adjustTimingFormTime(p.id, -5);
                      setTimingFormData(prev => ({ ...prev, [p.id]: { ...prev[p.id], date: getToday() } }));
                    }}
                    className="h-11 w-10 flex items-center justify-center rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-500 disabled:opacity-20 active:scale-90 transition-all"
                  >
                    <span className="text-[10px] font-bold">-5</span>
                  </button>

                  {/* Time Display Wrapper */}
                  <div className={`relative flex-1 h-11 rounded-xl border flex items-center justify-center transition-all ${
                    hasValue 
                      ? 'bg-gray-900 dark:bg-white border-transparent' 
                      : 'bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700'
                  }`}>
                    <span className={`text-lg font-anonymous font-bold tabular-nums ${
                      hasValue ? 'text-white dark:text-gray-900' : 'text-gray-300 dark:text-gray-600'
                    }`}>
                      {hasValue ? formatTime12(val).replace(/<[^>]*>?/gm, '') : 'NOT SET'}
                    </span>
                    
                    {/* The Native Picker Overlay */}
                    <input
                      type="time"
                      value={val}
                      onChange={(e) =>
                        setTimingFormData({
                          ...timingFormData,
                          [p.id]: {
                            ...timingFormData[p.id],
                            time: e.target.value,
                            date: getToday(),
                          },
                        })
                      }
                      className="absolute inset-0 opacity-0 cursor-pointer w-full"
                    />
                  </div>

                  <button
                    disabled={!hasValue}
                    onClick={() => {
                      adjustTimingFormTime(p.id, 5);
                      setTimingFormData(prev => ({ ...prev, [p.id]: { ...prev[p.id], date: getToday() } }));
                    }}
                    className="h-11 w-10 flex items-center justify-center rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-500 disabled:opacity-20 active:scale-90 transition-all"
                  >
                    <span className="text-[10px] font-bold">+5</span>
                  </button>

                  {/* CLEAR BUTTON */}
                  <button
                    onClick={() => {
                      setTimingFormData({
                        ...timingFormData,
                        [p.id]: { ...timingFormData[p.id], time: '' }
                      });
                    }}
                    className={`h-11 w-10 flex items-center justify-center rounded-xl transition-all ${
                        hasValue 
                        ? 'bg-red-50 dark:bg-red-900/20 text-red-500 hover:bg-red-500 hover:text-white' 
                        : 'bg-transparent text-gray-300 pointer-events-none'
                    }`}
                  >
                    <i className="fas fa-times-circle text-sm"></i>
                  </button>
                </div>

                {/* Metadata Row */}
                {hasValue && (
                  <div className="flex items-center justify-between mt-3 px-1 animate-in fade-in slide-in-from-top-1">
                    <label className="flex items-center gap-2 cursor-pointer group">
                      <input
                        type="checkbox"
                        checked={isFixed}
                        onChange={(e) =>
                          setTimingFormData({
                            ...timingFormData,
                            [p.id]: { ...timingFormData[p.id], fixed: e.target.checked },
                          })
                        }
                        className="h-3.5 w-3.5 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                      />
                      <span className="text-[9px] font-bold text-gray-400 uppercase tracking-tight group-hover:text-gray-600">
                        Fixed year-round
                      </span>
                    </label>

                    {!isFixed && (
                      <div className="flex items-center gap-1.5 bg-brand-50 dark:bg-brand-900/10 px-2 py-0.5 rounded-md">
                        <i className="far fa-calendar-alt text-[9px] text-brand-500"></i>
                        <input
                          type="date"
                          value={updateDate}
                          onChange={(e) =>
                            setTimingFormData({
                              ...timingFormData,
                              [p.id]: { ...timingFormData[p.id], date: e.target.value || getToday() },
                            })
                          }
                          className="bg-transparent text-[10px] font-bold text-brand-700 dark:text-brand-400 outline-none w-20"
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          });
        })()}
      </div>

      {/* Footer */}
      <div className="p-5 border-t border-gray-100 dark:border-gray-800">
        <button
          onClick={saveTimings}
          className="w-full py-4 bg-brand-600 hover:bg-brand-700 text-white rounded-2xl text-sm font-bold shadow-lg shadow-brand-500/30 uppercase tracking-widest transition-all active:scale-95"
        >
          Save All Changes
        </button>
      </div>
    </div>
  </div>
)}



{/* Info Edit Modal */}
{activeModal === 'info' && (
  <div
    onClick={(e) => handleModalClickOutside(e, 'info')}
    className="fixed inset-0 z-50 bg-black/60 backdrop-blur-md flex items-center justify-center p-4"
  >
    <div className="bg-white dark:bg-gray-900 rounded-3xl w-full max-w-sm shadow-2xl animate-card overflow-hidden border border-gray-100 dark:border-gray-800">
      
      {/* Header */}
      <div className="flex justify-between items-center px-6 py-5 border-b border-gray-50 dark:border-gray-800">
        <div>
          <h3 className="text-xl font-bold text-gray-900 dark:text-white">
            {selectedMosqueId ? 'Edit Masjid' : 'Add New Masjid'}
          </h3>
          <p className="text-xs text-gray-400 font-medium uppercase tracking-wider">Basic Information</p>
        </div>
        {selectedMosqueId && (
          <button
            onClick={deleteMosque}
            className="w-10 h-10 rounded-xl bg-red-50 dark:bg-red-900/20 text-red-500 flex items-center justify-center hover:bg-red-500 hover:text-white transition-all active:scale-90"
            title="Delete Masjid"
          >
            <i className="fas fa-trash-alt"></i>
          </button>
        )}
      </div>

      {/* Form Body */}
      <div className="p-6 space-y-5">
        
        {/* Name Field */}
        <div className="space-y-1.5">
          <label className="text-[11px] font-bold text-gray-400 dark:text-gray-500 uppercase ml-1">Masjid Name</label>
          <div className="relative">
            <i className="fas fa-mosque absolute left-3 top-1/2 -translate-y-1/2 text-brand-500/50 text-sm"></i>
            <input
              type="text"
              value={mosqueFormData.name}
              onChange={e => setMosqueFormData({ ...mosqueFormData, name: e.target.value })}
              className="w-full bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-700 rounded-xl pl-10 pr-4 py-3 font-bold text-gray-900 dark:text-white focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 outline-none transition-all"
              placeholder="e.g. Masjid-e-Bilal"
            />
          </div>
        </div>

        {/* Area Field */}
        <div className="space-y-1.5">
          <label className="text-[11px] font-bold text-gray-400 dark:text-gray-500 uppercase ml-1">Area / Locality</label>
          <div className="relative">
            <i className="fas fa-map-marker-alt absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm"></i>
            <input
              type="text"
              value={mosqueFormData.area}
              onChange={e => setMosqueFormData({ ...mosqueFormData, area: e.target.value })}
              className="w-full bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-700 rounded-xl pl-10 pr-4 py-2.5 text-sm font-medium text-gray-900 dark:text-white focus:ring-2 focus:ring-brand-500/20 outline-none transition-all"
              placeholder="e.g. Banjara Hills"
            />
          </div>
        </div>

        {/* Location Link */}
        <div className="space-y-1.5">
          <label className="text-[11px] font-bold text-gray-400 dark:text-gray-500 uppercase ml-1">Google Maps Link</label>
          <div className="relative">
            <i className="fas fa-link absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs"></i>
            <input
              type="url"
              value={mosqueFormData.locationLink}
              onChange={e => setMosqueFormData({ ...mosqueFormData, locationLink: e.target.value })}
              className="w-full bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-700 rounded-xl pl-10 pr-4 py-2.5 text-xs font-medium text-blue-600 dark:text-blue-400 focus:ring-2 focus:ring-brand-500/20 outline-none transition-all"
              placeholder="https://goo.gl/maps/..."
            />
          </div>
        </div>

        {/* Address / Notes */}
        <div className="space-y-1.5">
          <label className="text-[11px] font-bold text-gray-400 dark:text-gray-500 uppercase ml-1">Address & Notes</label>
          <textarea
            value={mosqueFormData.address}
            onChange={e => setMosqueFormData({ ...mosqueFormData, address: e.target.value })}
            rows="2"
            className="w-full bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-700 rounded-xl px-4 py-3 text-xs font-medium text-gray-600 dark:text-gray-300 focus:ring-2 focus:ring-brand-500/20 outline-none transition-all resize-none"
            placeholder="Full address or special instructions..."
          ></textarea>
        </div>
      </div>

      {/* Footer - Conditional Buttons */}
      <div className="p-6 bg-gray-50 dark:bg-gray-800/30 flex flex-col gap-3">
        {!selectedMosqueId ? (
          /* ADD MODE BUTTONS */
          <div className="flex flex-col gap-3">
            <button
              onClick={() => saveMosqueInfo(true)}
              className="w-full py-4 bg-brand-600 hover:bg-brand-700 text-white rounded-2xl text-sm font-bold shadow-lg shadow-brand-500/20 uppercase tracking-widest transition-all active:scale-[0.98]"
            >
              Save & Add Timings
            </button>
            <button
              onClick={() => setActiveModal(null)}
              className="w-full py-3 bg-transparent text-gray-500 dark:text-gray-400 text-xs font-bold uppercase tracking-widest hover:text-gray-700 transition-colors"
            >
              Cancel
            </button>
          </div>
        ) : (
          /* EDIT MODE BUTTONS */
          <div className="space-y-3">
            <div className="flex gap-3">
              <button
                onClick={() => saveMosqueInfo(false)}
                className="flex-1 py-3.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 rounded-2xl text-[11px] font-bold uppercase tracking-wider hover:bg-gray-50 transition-all active:scale-95 shadow-sm"
              >
                Save & Exit
              </button>
              <button
                onClick={() => saveMosqueInfo(true)}
                className="flex-[1.5] py-3.5 bg-brand-600 text-white rounded-2xl text-[11px] font-bold uppercase tracking-wider hover:bg-brand-700 transition-all active:scale-95 shadow-lg shadow-brand-500/20"
              >
                Edit Timings
              </button>
            </div>
            <button
              onClick={() => setActiveModal(null)}
              className="w-full py-2 bg-transparent text-gray-400 text-[10px] font-bold uppercase tracking-widest hover:text-gray-600 transition-colors"
            >
              Cancel
            </button>
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
                        <input type="text" value={contactForm.name} onChange={e=>setContactForm({...contactForm, name: e.target.value})} className="w-full bg-gray-50 border rounded-lg px-3 py-2 text-xs" placeholder="Name (Optional)" />
                        <input type="text" value={contactForm.email} onChange={e=>setContactForm({...contactForm, email: e.target.value})} className="w-full bg-gray-50 border rounded-lg px-3 py-2 text-xs" placeholder="Email/Phone No. (Optional)" />
                        <textarea rows="4" value={contactForm.message} onChange={e=>setContactForm({...contactForm, message: e.target.value})} className="w-full bg-gray-50 border rounded-lg px-3 py-2 text-xs" placeholder="Your Message (Required)"></textarea>
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
        <div className={`fixed bottom-24 left-1/2 transform -translate-x-1/2 bg-gray-900 text-white px-5 py-2.5 rounded-full text-xs font-bold shadow-2xl transition-all duration-300 z-50 pointer-events-none font-sans ${toastVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
            <i className="fas fa-check-circle text-brand-400 mr-2"></i><span>{toastMessage}</span>
        </div>
    </div>
  );
}
