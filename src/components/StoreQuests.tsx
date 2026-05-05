import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { UserProfile } from '../types';
import { Coins, Sparkles, Target, Palette, Flame, AlertCircle } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import confetti from 'canvas-confetti';
import { playSuccessSound } from '../lib/sounds';
import { useTranslation } from '../locales/i18n';
import { motion, AnimatePresence } from 'motion/react';

const STORE_THEMES = [
  { id: 'default', name: 'Original Look', price: 0, color: 'bg-neutral-800' },
  { id: 'neon-blue', name: 'Neon Blue', price: 50, color: 'bg-blue-600' },
  { id: 'hacker-green', name: 'Hacker Green', price: 50, color: 'bg-green-600' },
  { id: 'sunset-orange', name: 'Sunset Orange', price: 50, color: 'bg-orange-600' },
  { id: 'dracula-purple', name: 'Dracula Purple', price: 100, color: 'bg-purple-600' },
  { id: 'cherry-blossom', name: 'Cherry Blossom', price: 150, color: 'bg-pink-500' },
  { id: 'cyberpunk-yellow', name: 'Cyberpunk Yellow', price: 150, color: 'bg-yellow-400' },
  { id: 'royal-gold', name: 'Royal Gold', price: 200, color: 'bg-yellow-600' },
  { id: 'synthwave-magenta', name: 'Synthwave Magenta', price: 200, color: 'bg-fuchsia-600' },
  { id: 'gold-and-black', name: 'Gold & Black', price: 250, color: 'bg-amber-500 ring-black' }
];

export const StoreQuests: React.FC = () => {
  const { user } = useAuth();
  const { t } = useTranslation();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (message: string) => {
    setToastMessage(message);
    setTimeout(() => setToastMessage(null), 3000);
  };

  // We are not changing global theme layout right now, we are just storing it.
  // Full theme CSS implementation will be basic.

  useEffect(() => {
    if (!user) {
      setLoading(false); return;
    }
    const fetchProfile = async () => {
      try {
        const d = await getDoc(doc(db, 'users', user.uid));
        if (d.exists()) {
          const data = d.data() as UserProfile;
          if (data.credits === undefined) data.credits = 0;
          if (!data.purchasedThemes) data.purchasedThemes = ['default'];
          if (!data.activePremiumTheme) data.activePremiumTheme = 'default';
          setProfile(data);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchProfile();
  }, [user]);

  const buyTheme = async (themeId: string, price: number) => {
    if (!user || !profile) return;
    if (profile.purchasedThemes?.includes(themeId)) {
      // Just equip
      try {
        await updateDoc(doc(db, 'users', user.uid), { activePremiumTheme: themeId, updatedAt: serverTimestamp() });
        setProfile({ ...profile, activePremiumTheme: themeId });
        // Set body attribute
        document.documentElement.setAttribute('data-premium-theme', themeId);
        playSuccessSound();
      } catch (err) {
         handleFirestoreError(err, OperationType.UPDATE, 'users');
      }
      return;
    }

    if ((profile.credits || 0) < price) {
      showToast("Not enough credits! Complete quests to earn more.");
      return;
    }

    // Purchase
    try {
      const newCredits = (profile.credits || 0) - price;
      const newThemes = [...(profile.purchasedThemes || []), themeId];
      await updateDoc(doc(db, 'users', user.uid), {
        credits: newCredits,
        purchasedThemes: newThemes,
        activePremiumTheme: themeId,
        updatedAt: serverTimestamp()
      });
      setProfile({ ...profile, credits: newCredits, purchasedThemes: newThemes, activePremiumTheme: themeId });
      document.documentElement.setAttribute('data-premium-theme', themeId);
      playSuccessSound();
      confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 }
      });
    } catch (err) {
       handleFirestoreError(err, OperationType.UPDATE, 'users');
    }
  };

  const buyFood = async () => {
    if (!user || !profile) return;
    if ((profile.credits || 0) < 20) {
      showToast("Not enough credits!");
      return;
    }
    try {
      const newCredits = (profile.credits || 0) - 20;
      const newFood = (profile.petFood || 0) + 1;
      await updateDoc(doc(db, 'users', user.uid), {
        credits: newCredits,
        petFood: newFood,
        updatedAt: serverTimestamp()
      });
      setProfile({ ...profile, credits: newCredits, petFood: newFood });
      playSuccessSound();
    } catch (err) {
       handleFirestoreError(err, OperationType.UPDATE, 'users');
    }
  };

  const buyWater = async () => {
    if (!user || !profile) return;
    if ((profile.credits || 0) < 10) {
      showToast("Not enough credits!");
      return;
    }
    try {
      const newCredits = (profile.credits || 0) - 10;
      const newWater = (profile.petWater || 0) + 1;
      await updateDoc(doc(db, 'users', user.uid), {
        credits: newCredits,
        petWater: newWater,
        updatedAt: serverTimestamp()
      });
      setProfile({ ...profile, credits: newCredits, petWater: newWater });
      playSuccessSound();
    } catch (err) {
       handleFirestoreError(err, OperationType.UPDATE, 'users');
    }
  };

  const AVAILABLE_PETS = [
    { id: 2, name: 'Smart Dog', icon: '🐶', price: 200, ability: '+2 Credits per correct answer' },
    { id: 3, name: 'Wise Owl', icon: '🦉', price: 500, ability: '+5 Credits per correct answer' },
    { id: 4, name: 'Genius Fox', icon: '🦊', price: 800, ability: '+10 Credits per correct answer' },
    { id: 5, name: 'Scholar Panda', icon: '🐼', price: 1000, ability: '+15 Credits per correct answer' },
    { id: 6, name: 'Wizard Frog', icon: '🐸', price: 1500, ability: '+20 Credits per correct answer' },
    { id: 7, name: 'Cyber Wolf', icon: '🐺', price: 2500, ability: '+30 Credits per correct answer' },
    { id: 8, name: 'Mystic Dragon', icon: '🐲', price: 5000, ability: '+50 Credits per correct answer' },
    { id: 9, name: 'Cosmic Bear', icon: '🐻', price: 8000, ability: '+70 Credits per correct answer' },
    { id: 10, name: 'Quantum Unicorn', icon: '🦄', price: 12000, ability: '+100 Credits per correct answer' },
    { id: 11, name: 'Galaxy Phoenix', icon: '🐦‍🔥', price: 20000, ability: '+150 Credits per correct answer' }
  ];

  const buyPet = async (petDef: any) => {
    if (!user || !profile) return;
    const hasPet = profile.myPets?.find(p => p.id === petDef.id);
    if (hasPet) return;

    if ((profile.credits || 0) < petDef.price) {
      showToast("Not enough credits!");
      return;
    }
    
    try {
      const newCredits = (profile.credits || 0) - petDef.price;
      const newPets = [...(profile.myPets || []), { id: petDef.id, name: petDef.name, icon: petDef.icon, happiness: 50, fun: 50, cleanliness: 50 }];
      await updateDoc(doc(db, 'users', user.uid), {
        credits: newCredits,
        myPets: newPets,
        updatedAt: serverTimestamp()
      });
      setProfile({ ...profile, credits: newCredits, myPets: newPets });
      playSuccessSound();
      confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
    } catch (err) {
       handleFirestoreError(err, OperationType.UPDATE, 'users');
    }
  };

  const equipPet = async (pet: any) => {
    if (!user || !profile) return;
    try {
      await updateDoc(doc(db, 'users', user.uid), {
        activePet: pet,
        updatedAt: serverTimestamp()
      });
      setProfile({ ...profile, activePet: pet });
    } catch (err) {
       handleFirestoreError(err, OperationType.UPDATE, 'users');
    }
  };
  const claimDaily = async () => {
     if (!user || !profile) return;
     const tz = profile.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
     const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' });
     const todayStr = formatter.format(new Date());

     if (profile.lastClaimedDaily === todayStr) {
        showToast("Already claimed today!");
        return;
     }

     try {
       const newCredits = (profile.credits || 0) + 15;
       await updateDoc(doc(db, 'users', user.uid), { 
         credits: newCredits, 
         lastClaimedDaily: todayStr,
         updatedAt: serverTimestamp() 
       });
       setProfile({...profile, credits: newCredits, lastClaimedDaily: todayStr});
       playSuccessSound();
       confetti({
         particleCount: 50,
         spread: 60,
         origin: { y: 0.8 }
       });
       showToast("Claimed 15 credits!");
     } catch (err) {
       handleFirestoreError(err, OperationType.UPDATE, 'users');
     }
  }

  if (!user) {
     return (
      <div className="flex-1 p-8 flex items-center justify-center flex-col text-center">
        <h2 className="text-2xl font-bold text-neutral-900 dark:text-white mb-2">Authentication Required</h2>
      </div>
    );
  }

  if (loading) return <div className="p-8">Loading...</div>;

  return (
    <div className="space-y-8 flex-1 p-6 md:p-8 overflow-y-auto relative">
      <AnimatePresence>
        {toastMessage && (
          <motion.div
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            className="absolute top-4 right-8 z-50 flex items-center gap-2 bg-red-500 text-white px-4 py-3 rounded-lg shadow-lg font-medium"
          >
            <AlertCircle className="w-5 h-5" />
            <span>{toastMessage}</span>
          </motion.div>
        )}
      </AnimatePresence>
      <header className="mb-8 flex flex-col md:flex-row items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-neutral-900 dark:text-white tracking-tight">{t('store_title')}</h1>
          <p className="text-neutral-500 dark:text-neutral-400 text-sm mt-1">{t('store_desc')}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
           {profile?.activePet && (
             <div className="flex items-center gap-3 px-4 py-2 bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-200 dark:border-indigo-500/30 rounded-xl" title={`Pet Happiness: ${profile?.activePet?.happiness ?? 50}%`}>
                <div className="text-xl leading-none">{profile?.activePet.icon}</div>
                <div className="w-16 h-2 bg-white dark:bg-neutral-800 rounded-full overflow-hidden shadow-inner">
                   <div className="h-full bg-emerald-500 transition-all duration-500" style={{ width: `${profile?.activePet?.happiness ?? 50}%` }}></div>
                </div>
             </div>
           )}
           <div className="flex items-center gap-2 px-4 py-2 bg-orange-50 dark:bg-orange-500/10 border border-orange-200 dark:border-orange-500/30 rounded-xl" title={`Daily Streak: ${profile?.streak || 0} days`}>
              <Flame className="w-5 h-5 text-orange-500 stroke-[2.5]" />
              <span className="font-bold text-orange-700 dark:text-orange-400">{profile?.streak || 0}</span>
           </div>
           <div className="flex items-center gap-2 px-4 py-2 bg-yellow-50 dark:bg-yellow-500/10 border border-yellow-200 dark:border-yellow-500/30 rounded-xl">
              <Coins className="w-5 h-5 text-yellow-600 dark:text-yellow-500" />
              <span className="font-bold text-yellow-700 dark:text-yellow-400">{profile?.credits || 0}</span>
           </div>
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Quests Section */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <Target className="w-5 h-5 text-indigo-500" />
            <h2 className="text-lg font-medium text-neutral-900 dark:text-white">Active Quests</h2>
          </div>
          <div className="space-y-3">
             <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 p-4 rounded-xl flex items-center justify-between shadow-sm">
                <div>
                   <h3 className="font-medium text-sm text-neutral-900 dark:text-white">Daily Login</h3>
                   <p className="text-xs text-neutral-500 dark:text-neutral-400">Login to the app today.</p>
                </div>
                <button 
                  onClick={claimDaily} 
                  disabled={profile?.lastClaimedDaily === new Date().toISOString().split('T')[0]}
                  className={`px-3 py-1.5 text-white text-xs font-bold rounded-lg transition-colors ${profile?.lastClaimedDaily === new Date().toISOString().split('T')[0] ? 'bg-neutral-400 dark:bg-neutral-700 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-700'}`}>
                   {profile?.lastClaimedDaily === new Date().toISOString().split('T')[0] ? 'Claimed' : 'Claim +15'}
                </button>
             </div>
             
             {/* Note: This is an unlinked dummy quest for UI presentation */}
             <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 p-4 rounded-xl flex items-center justify-between shadow-sm opacity-60">
                <div>
                   <h3 className="font-medium text-sm text-neutral-900 dark:text-white">Review 3 Topics</h3>
                   <p className="text-xs text-neutral-500 dark:text-neutral-400">0/3 completed</p>
                </div>
                <span className="px-3 py-1.5 bg-neutral-200 dark:bg-neutral-800 text-neutral-500 dark:text-neutral-400 text-xs font-bold rounded-lg">
                   +30
                </span>
             </div>
          </div>
        </section>

        {/* Store Section */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <Palette className="w-5 h-5 text-pink-500" />
            <h2 className="text-lg font-medium text-neutral-900 dark:text-white">Shop</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
             <div className={`p-4 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 shadow-sm`}>
               <div className="flex items-center gap-2 mb-3">
                 <div className="text-xl">🥩</div>
                 <h3 className="font-medium text-sm text-neutral-900 dark:text-white">Pet Food (x1)</h3>
                 <span className="ml-auto text-xs text-neutral-500 font-bold bg-neutral-100 dark:bg-neutral-800 px-2 py-1 rounded">Owned: {profile?.petFood || 0}</span>
               </div>
               <button 
                 onClick={buyFood}
                 className="w-full py-2 rounded-lg text-xs font-bold transition-all bg-indigo-600 text-white hover:bg-indigo-700"
               >
                 Buy - 20 Credits
               </button>
             </div>
             
             <div className={`p-4 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 shadow-sm`}>
               <div className="flex items-center gap-2 mb-3">
                 <div className="text-xl">💧</div>
                 <h3 className="font-medium text-sm text-neutral-900 dark:text-white">Pet Water (x1)</h3>
                 <span className="ml-auto text-xs text-neutral-500 font-bold bg-neutral-100 dark:bg-neutral-800 px-2 py-1 rounded">Owned: {profile?.petWater || 0}</span>
               </div>
               <button 
                 onClick={buyWater}
                 className="w-full py-2 rounded-lg text-xs font-bold transition-all bg-cyan-600 text-white hover:bg-cyan-700"
               >
                 Buy - 10 Credits
               </button>
             </div>
             
             {AVAILABLE_PETS.map(petDef => {
               const ownedPet = profile?.myPets?.find(p => p.id === petDef.id);
               const isActive = profile?.activePet?.id === petDef.id;

               return (
                 <div key={petDef.id} className={`p-4 rounded-xl border flex flex-col justify-between ${isActive ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-500/10' : 'border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900'} shadow-sm`}>
                   <div className="mb-3">
                     <div className="flex items-center gap-2 mb-1">
                       <div className="text-xl">{petDef.icon}</div>
                       <h3 className="font-medium text-sm text-neutral-900 dark:text-white">{petDef.name}</h3>
                     </div>
                     <p className="text-[10px] sm:text-xs text-neutral-500 dark:text-neutral-400 leading-tight">
                       {petDef.ability}
                     </p>
                   </div>
                   {!ownedPet ? (
                     <button 
                       onClick={() => buyPet(petDef)}
                       className="w-full py-2 rounded-lg text-xs font-bold transition-all bg-indigo-600 text-white hover:bg-indigo-700"
                     >
                       Buy - {petDef.price} Credits
                     </button>
                   ) : (
                     <button 
                       onClick={() => equipPet(ownedPet)}
                       disabled={isActive}
                       className={`w-full py-2 rounded-lg text-xs font-bold transition-all ${isActive ? 'bg-indigo-100 dark:bg-indigo-900/50 text-indigo-600 dark:text-indigo-400 cursor-default' : 'bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-700 text-neutral-900 dark:text-white'}`}
                     >
                       {isActive ? 'Equipped' : 'Equip'}
                     </button>
                   )}
                 </div>
               );
             })}
          </div>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {STORE_THEMES.map(theme => {
               const isOwned = profile?.purchasedThemes?.includes(theme.id) || theme.id === 'default';
               const isActive = profile?.activePremiumTheme === theme.id || (!profile?.activePremiumTheme && theme.id ==='default');

               return (
                 <div key={theme.id} className={`p-4 rounded-xl border transition-all ${isActive ? 'border-pink-500 bg-pink-50 dark:bg-pink-500/10' : 'border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 shadow-sm'}`}>
                   <div className="flex items-center gap-2 mb-3">
                     <div className={`w-4 h-4 rounded-full ${theme.color} ring-2 ring-offset-2 ring-offset-white dark:ring-offset-neutral-900 ring-neutral-200 dark:ring-neutral-700`} />
                     <h3 className="font-medium text-sm text-neutral-900 dark:text-white">{theme.name}</h3>
                   </div>
                   
                   <button 
                     onClick={() => buyTheme(theme.id, theme.price)}
                     disabled={isActive}
                     className={`w-full py-2 rounded-lg text-xs font-bold transition-all ${
                       isActive 
                        ? 'bg-pink-100 dark:bg-pink-500/20 text-pink-600 dark:text-pink-400 opacity-50 cursor-not-allowed' 
                        : isOwned 
                          ? 'bg-neutral-100 dark:bg-neutral-800 text-neutral-900 dark:text-white hover:bg-neutral-200 dark:hover:bg-neutral-700'
                          : 'bg-indigo-600 text-white hover:bg-indigo-700'
                     }`}
                   >
                     {isActive ? 'Equipped' : isOwned ? 'Equip' : `Buy - ${theme.price} Credits`}
                   </button>
                 </div>
               );
            })}
          </div>
        </section>
      </div>
    </div>
  );
};
