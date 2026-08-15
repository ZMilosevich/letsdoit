import { createContext, ReactNode, useContext, useEffect, useMemo, useRef, useState } from 'react';

export type Language = 'hr' | 'en';

// Add a new language by adding another dictionary here. The English source strings remain the stable keys.
const hr: Record<string, string> = {
  'Overview':'Pregled','Clients':'Klijenti','Schedule':'Raspored','Reports':'Izvještaji','Head trainer':'Glavni trener',
  'Open trainer menu':'Otvori izbornik trenera','Trainer profile':'Profil trenera','Language':'Jezik','Trainer account':'Račun trenera','Manage your workspace preferences and language.':'Upravljajte postavkama radnog prostora i jezikom.','Croatian is the default for new users. Your choice is saved for future visits.':'Hrvatski je zadani jezik za nove korisnike. Vaš se odabir pamti za buduće posjete.','Default':'Zadano',
  'Good morning, Kiki':'Dobro jutro, Kiki','Here’s how your clients are moving this week.':'Ovako napreduju vaši klijenti ovaj tjedan.','Add client':'Dodaj klijenta',
  'Active clients':'Aktivni klijenti','Sessions completed':'Završeni treninzi','Plans to review':'Planovi za pregled','Need attention':'Potrebna pažnja',
  'Thursday, August 13':'Četvrtak, 13. kolovoza','4 training this week':'4 treniraju ovaj tjedan','78% completion rate':'78% stopa završetka','Before next Monday':'Prije sljedećeg ponedjeljka','Down from last week':'Manje nego prošli tjedan',
  'Weekly adjustment ready':'Tjedna prilagodba je spremna','Maya completed every session and reported lower difficulty. A progression is ready for your review.':'Maya je završila svaki trening i prijavila manju težinu. Napredovanje je spremno za vaš pregled.','Review plan':'Pregledaj plan','Training status and weekly momentum':'Status treninga i tjedni napredak','Search clients':'Pretraži klijente','Filter clients':'Filtriraj klijente','All clients':'Svi klijenti',
  'Client':'Klijent','Goal':'Cilj','Status':'Status','Today':'Danas','Yesterday':'Jučer','2 days ago':'Prije 2 dana','4 days ago':'Prije 4 dana',
  'Body composition and energy':'Tjelesna kompozicija i energija','Improve endurance for a 10K':'Poboljšati izdržljivost za utrku od 10 km','Athletic performance':'Sportska izvedba','Build strength and confidence':'Izgraditi snagu i samopouzdanje',
  'On track':'Prema planu','Needs attention':'Potrebna pažnja','Plan needed':'Potreban plan','Missed sessions':'Propušteni treninzi','Plan ready':'Plan je spreman','Plan sent':'Plan je poslan','Plan scheduled':'Plan je zakazan','Plan viewed':'Plan je pregledan','Plan confirmed':'Plan je potvrđen',
  'Client management':'Upravljanje klijentima','Open a profile to review assessments, workouts, and progress.':'Otvorite profil za pregled procjene, treninga i napretka.','selected':'odabrano','Publish plans':'Objavi planove','Clear selected clients':'Poništi odabir klijenata','Select':'Odaberi','clients':'klijenata','sessions weekly':'treninga tjedno',
  'Training calendar':'Kalendar treninga','A clear view of upcoming client sessions and check-ins.':'Jasan pregled nadolazećih treninga i provjera.','Schedule session':'Zakaži trening','Today’s schedule':'Današnji raspored','sessions planned':'planiranih treninga','No sessions scheduled today':'Danas nema zakazanih treninga','Open calendar':'Otvori kalendar','Schedule a training session':'Zakaži trening','Previous period':'Prethodno razdoblje','Next period':'Sljedeće razdoblje','Filter by client':'Filtriraj po klijentu','Filter by training type':'Filtriraj po vrsti treninga','All training types':'Sve vrste treninga','Month':'Mjesec','Week':'Tjedan','Day':'Dan','Calendar view':'Prikaz kalendara','Time':'Vrijeme','Mon':'Pon','Tue':'Uto','Wed':'Sri','Thu':'Čet','Fri':'Pet','Sat':'Sub','Sun':'Ned','more':'više','Drag a session to move it':'Povucite trening za promjenu termina','Completed':'Završeno','Cancelled':'Otkazano','New training session':'Novi trening','Session details':'Detalji treninga','Review or update this training':'Pregledajte ili ažurirajte ovaj trening','Schedule a client session':'Zakažite trening klijentu','Session name':'Naziv treninga','Training type':'Vrsta treninga','Date':'Datum','Start time':'Vrijeme početka','Repeat':'Ponavljanje','Does not repeat':'Ne ponavlja se','Every Monday and Wednesday':'Svaki ponedjeljak i srijedu','Every Monday':'Svaki ponedjeljak','Every Wednesday':'Svaku srijedu','Notes':'Bilješke','Training notes or focus for this session':'Bilješke ili fokus ovog treninga','Strength':'Snaga','Conditioning':'Kondicija','Recovery':'Oporavak','Strength technique':'Tehnika snage','Mobility review':'Pregled mobilnosti','Friday':'Petak','Saturday':'Subota','Monday':'Ponedjeljak','Upcoming':'Nadolazeće','Full body power':'Snaga cijelog tijela','Aerobic intervals':'Aerobni intervali','Mobility and recovery':'Mobilnost i oporavak','Upper strength':'Snaga gornjeg dijela tijela','Open':'Otvori',
  'Progress reporting':'Izvještavanje o napretku','Quick signals from your client roster, ready for coaching decisions.':'Brzi pokazatelji iz vaše liste klijenata, spremni za odluke trenera.','This week':'Ovaj tjedan','Completion rate':'Stopa završetka','Training minutes':'Minute treninga','Personal records':'Osobni rekordi','Check-ins due':'Potrebne provjere','Coaching signals':'Trenerski pokazatelji','What deserves attention this week':'Što zaslužuje pažnju ovaj tjedan',
  'Up 6% from last week':'Porast od 6% u odnosu na prošli tjedan','Across 7 sessions':'Kroz 7 treninga','This month':'Ovaj mjesec','Jordan and Marcus':'Jordan i Marcus','Ready to progress':'Spremna za napredovanje','Follow up':'Potrebno praćenje','All sessions completed below target difficulty. Consider a 2.5% primary lift increase.':'Svi su treninzi završeni ispod ciljane težine. Razmotrite povećanje glavnog dizanja za 2,5%.','Difficulty rose while session completion dipped. Check recovery before increasing volume.':'Težina se povećala, a završavanje treninga smanjilo. Provjerite oporavak prije povećanja volumena.','Open profile':'Otvori profil',
  'New client assessment':'Početna procjena klijenta','Start with the basics':'Počnite s osnovama','Training profile':'Profil treninga','Step':'Korak','of':'od','Full name':'Ime i prezime','Email':'E-pošta','Age':'Dob','Fitness level':'Razina kondicije','Weight (kg)':'Težina (kg)','Height (cm)':'Visina (cm)','Primary goal':'Glavni cilj','Continue':'Nastavi','Back':'Natrag','Create client and plan':'Izradi klijenta i plan',
  'Client name':'Ime klijenta','Client language':'Jezik klijenta','Build strength, improve mobility…':'Izgradite snagu, poboljšajte mobilnost…','Current physical condition':'Trenutačno fizičko stanje','Current activity, recovery, general readiness':'Trenutačna aktivnost, oporavak i opća spremnost','Injuries or limitations':'Ozljede ili ograničenja','Include movements that cause discomfort':'Uključite pokrete koji izazivaju nelagodu','Available equipment':'Dostupna oprema','Full gym, dumbbells…':'Potpuno opremljena teretana, bučice…','Preferred workouts':'Željeni treninzi','Strength, cycling…':'Snaga, biciklizam…','Training days per week':'Dani treninga tjedno','days':'dana','Beginner':'Početnik','Intermediate':'Srednja razina','Advanced':'Napredna razina','Close':'Zatvori',
  'Review weekly plan':'Pregledaj tjedni plan','Client view':'Prikaz klijenta','Workouts':'Treninzi','Progress':'Napredak','Weekly completion':'Tjedna realizacija','Current weight':'Trenutačna težina','Squat best':'Najbolji čučanj','Average difficulty':'Prosječna težina','sessions completed':'završenih treninga','Edit plan':'Uredi plan','Coach insight':'Trenerski uvid','Next week’s recommendation':'Preporuka za sljedeći tjedan','Weekly analysis':'Tjedna analiza','Review adjustment':'Pregledaj prilagodbu','Workout history':'Povijest treninga','Completed and upcoming sessions':'Završeni i nadolazeći treninzi','Progress over time':'Napredak kroz vrijeme','Add check-in':'Dodaj provjeru','Strength trend · squat':'Trend snage · čučanj','Latest measurements':'Najnovija mjerenja','Progress photos':'Fotografije napretka',
  'years':'godina','Schedule confirmed':'Raspored potvrđen','Baseline recorded':'Početno stanje zabilježeno','Personal record this month':'Osobni rekord ovog mjeseca','From completed sessions':'Iz završenih treninga','Based on':'Na temelju','completion':'završetka','difficulty':'težine','recent feedback':'nedavnih povratnih informacija','Not logged':'Nije zabilježeno','Measurements, strength, feedback, and assessment results':'Mjerenja, snaga, povratne informacije i rezultati procjene','Weight':'Težina','Waist':'Struk','Body fat':'Tjelesna mast','No measurements yet.':'Još nema mjerenja.','Add progress photo':'Dodaj fotografiju napretka','Add photos privately with each check-in.':'Dodajte privatne fotografije uz svaku provjeru.','completed':'završeno','missed':'propušteno','upcoming':'nadolazeće',
  'Weekly plan':'Tjedni plan','Review before publishing':'Pregled prije objave','Save changes':'Spremi promjene','Publish plan':'Objavi plan','Update delivery':'Ažuriraj dostavu','Suggested from this week’s performance':'Predloženo prema izvedbi ovog tjedna','Trainer review required':'Potreban je pregled trenera','training days':'dana treninga','planned minutes':'planiranih minuta','Plan delivery':'Dostava plana','Publish to':'Objavi za','In-app notification':'Obavijest u aplikaciji','Email and in-app':'E-pošta i aplikacija','Make available':'Učini dostupnim','Cancel':'Odustani','Publish now':'Objavi odmah','Schedule plan':'Zakaži plan',
  'Make any final changes, then choose when this plan becomes available to':'Napravite završne izmjene, zatim odaberite kada će plan postati dostupan za','Available':'Dostupno','Client confirmed their schedule':'Klijent je potvrdio raspored','Client has viewed this plan':'Klijent je pregledao ovaj plan','Available in the client workspace':'Dostupno u prostoru klijenta','Change':'Promijeni','tailored to':'prilagođeno','level':'razini','exercises':'vježbi','Progressed':'Napredovanje','Maintained':'Zadržano','Exercise':'Vježba','Sets':'Serije','Reps':'Ponavljanja','Weight / intensity':'Težina / intenzitet','Rest':'Odmor','Exercise name':'Naziv vježbe','Repetitions':'Ponavljanja','Weight or intensity':'Težina ili intenzitet','Rest period':'Vrijeme odmora','Plan saved':'Plan je spremljen',
  'Publishes the plan directly in the client workspace.':'Objavljuje plan izravno u prostoru klijenta.','In-app publishing works now. Email sends when an email service is connected.':'Objava u aplikaciji radi odmah. E-pošta se šalje kada je usluga e-pošte povezana.','Leave the date empty to publish immediately. Clients can view the week, confirm their schedule, and leave feedback.':'Ostavite datum prazan za trenutnu objavu. Klijenti mogu pregledati tjedan, potvrditi raspored i ostaviti povratnu informaciju.',
  'Your training plan':'Tvoj plan treninga','Week of':'Tjedan','Your coach prepared this plan around your current goals, equipment, and recovery.':'Tvoj trener pripremio je plan prema ciljevima, opremi i oporavku.','Your next plan is on its way':'Tvoj sljedeći plan uskoro stiže','It will be available':'Bit će dostupan','once your coach publishes it':'kada ga trener objavi','Plan available':'Plan je dostupan','You confirmed this schedule. Your coach has your note.':'Potvrdio si ovaj raspored. Tvoj trener ima tvoju bilješku.','Please review your week and confirm that the schedule works for you.':'Pregledaj svoj tjedan i potvrdi odgovara li ti raspored.','Does this schedule work?':'Odgovara li ti ovaj raspored?','Confirm your week or leave a note for your coach.':'Potvrdi svoj tjedan ili ostavi bilješku treneru.','Optional feedback about this plan':'Neobavezna povratna informacija o ovom planu','Confirm schedule':'Potvrdi raspored','Recent sessions':'Nedavni treninzi','Loading your plan…':'Učitavanje tvog plana…','sets':'serija',
  'Workout log':'Zapis treninga','Duration (minutes)':'Trajanje (minute)','Difficulty (1–10)':'Težina (1–10)','Completed work':'Završeni rad','Client notes':'Bilješke klijenta','Save workout':'Spremi trening','Progress check-in':'Provjera napretka','Record new measurements':'Zabilježi nova mjerenja','Waist (cm)':'Struk (cm)','Body fat (%)':'Tjelesna mast (%)','Squat best (kg)':'Najbolji čučanj (kg)','Client feedback':'Povratna informacija klijenta','Progress photo':'Fotografija napretka','Save check-in':'Spremi provjeru',
  'Sets, reps, and weight used':'Serije, ponavljanja i korištena težina','How did the session feel?':'Kako je trening prošao?','Recovery, comfort, energy, confidence…':'Oporavak, udobnost, energija, samopouzdanje…','Retry':'Pokušaj ponovno','No clients found':'Nema pronađenih klijenata','Try a different search or filter.':'Pokušajte s drugim pretraživanjem ili filtrom.','Client updates could not be loaded.':'Nije moguće učitati novosti o klijentima.','This client profile could not be loaded.':'Nije moguće učitati profil klijenta.',
  'Lower body strength':'Snaga donjeg dijela tijela','Upper body build':'Razvoj snage gornjeg dijela tijela','Full body strength':'Snaga cijelog tijela','Easy run + strides':'Lagano trčanje i ubrzanja','Aerobic capacity':'Aerobni kapacitet','Back squat':'Stražnji čučanj','Romanian deadlift':'Rumunjsko mrtvo dizanje','Dumbbell bench press':'Potisak bučicama s klupe','Kettlebell deadlift':'Mrtvo dizanje s girjom','Incline push-up':'Sklek na povišenju','Bike intervals':'Intervali na biciklu','Zone 2 cardio':'Kardio u zoni 2','Mobility flow':'Vježbe mobilnosti','Half-kneeling press':'Potisak iz klečećeg položaja','Moderate':'Umjereno','Conversational':'Razgovorni tempo','None':'Nema','Easy':'Lagano','As needed':'Po potrebi','Strong session.':'Odličan trening.','Knee felt good throughout.':'Koljeno se cijelo vrijeme osjećalo dobro.','Pace dropped late.':'Tempo je usporio pri kraju.','Low back felt tight after rows.':'Donji dio leđa bio je napet nakon veslanja.','Energy improving':'Energija se poboljšava','Sleep has been solid':'San je bio kvalitetan','Feeling strong':'Osjećam se snažno','Legs felt heavy':'Noge su bile teške','cancelled':'otkazano','min':'min',
  'Box squat':'Čučanj na kutiju','Reverse lunge':'Iskorak unatrag','Single-arm cable row':'Veslanje na sajli jednom rukom','Controlled':'Kontrolirano','2 reps in reserve':'2 ponavljanja u rezervi','Continue with Google':'Nastavi s Googleom','or':'ili','Sign out':'Odjava','Exit preview':'Izađi iz pregleda','Loading…':'Učitavanje…','Loading your training…':'Učitavanje vašeg treninga…','e.g. Full body strength':'npr. Snaga cijelog tijela','scheduled':'zakazano','beginner':'početničkoj','intermediate':'srednjoj','advanced':'naprednoj','sessions weekly ·':'treninga tjedno ·','years ·':'godina ·','· Schedule confirmed':'· Raspored potvrđen','kg since last check-in':'kg od zadnje provjere','completion ·':'završetka ·','/10 difficulty · recent feedback':'/10 težine · nedavne povratne informacije','planned minutes · tailored to':'planiranih minuta · prilagođeno','sets ·':'serija ·','Unable to save this session.':'Nije moguće spremiti ovaj trening.','This time overlaps with another session.':'Ovaj se termin preklapa s drugim treningom.','Unable to change password.':'Nije moguće promijeniti lozinku.','Unable to save account.':'Nije moguće spremiti račun.','Unable to sign in.':'Prijava nije uspjela.','Google sign-in expired.':'Google prijava je istekla.','Google sign-in could not be completed.':'Google prijavu nije moguće dovršiti.','Google sign-in was not completed.':'Google prijava nije dovršena.','This Google account is not linked to LetsDoIt.':'Ovaj Google račun nije povezan s aplikacijom LetsDoIt.','Please sign in to continue.':'Prijavite se za nastavak.','Workout saved.':'Trening je spremljen.','Trainer access is required.':'Potreban je pristup trenera.','Administrator access is required.':'Potreban je pristup administratora.','Email or password is incorrect.':'E-pošta ili lozinka nisu ispravne.','Google sign-in is not configured yet.':'Google prijava još nije konfigurirana.','This sign-in link has expired.':'Ova poveznica za prijavu je istekla.','Use at least 10 characters.':'Upotrijebite najmanje 10 znakova.','Name, email, and a valid role are required.':'Ime, e-pošta i valjana uloga su obavezni.','An account with this email already exists.':'Račun s ovom e-poštom već postoji.','A valid name and email are required.':'Unesite valjano ime i e-poštu.','Account not found.':'Račun nije pronađen.','Active account not found.':'Aktivni račun nije pronađen.','Please complete the client, session name, date, and time.':'Ispunite klijenta, naziv treninga, datum i vrijeme.','Client not found':'Klijent nije pronađen.','Select at least one client':'Odaberite barem jednog klijenta.','Delivery not found':'Dostava nije pronađena.','This plan belongs to another client.':'Ovaj plan pripada drugom klijentu.','Session not found':'Trening nije pronađen.','Client access is required.':'Potreban je pristup klijenta.','Workout not found.':'Trening nije pronađen.','Name is required':'Ime je obavezno.','Plan not found':'Plan nije pronađen.','Recovery and execution are strong. Increase primary lift load by 2.5% next week.':'Oporavak i izvedba su odlični. Sljedeći tjedan povećajte opterećenje glavnog dizanja za 2,5%.','Reduce one working set on high-fatigue movements and check recovery before progressing load.':'Smanjite jednu radnu seriju kod vježbi koje stvaraju velik umor i provjerite oporavak prije povećanja opterećenja.',
};

function translateCroatian(value: string): string {
  if (hr[value]) return hr[value];
  const replacements: Array<[RegExp, (...parts: string[]) => string]> = [
    [/^(\d+) clients$/, n => `${n} klijenata`],
    [/^(\d+) selected$/, n => `${n} odabrano`],
    [/^(\d+) sessions$/, n => `${n} treninga`],
    [/^(\d+) sessions planned$/, n => `${n} planiranih treninga`],
    [/^(\d+) min$/, n => `${n} min`],
    [/^(\d+) sessions weekly · (.+)$/, (n, level) => `${n} treninga tjedno · ${hr[level] || level}`],
    [/^(\d+) sessions completed$/, n => `${n} završenih treninga`],
    [/^(\d+) days$/, n => `${n} dana`],
    [/^(\d+) years · (.+)$/, (n, level) => `${n} godina · ${hr[level] || level}`],
    [/^Week of (.+)$/, week => `Tjedan ${week}`],
    [/^Weekly plan · (.+)$/, week => `Tjedni plan · ${week}`],
    [/^(\d+) training days$/, n => `${n} dana treninga`],
    [/^(\d+) min · (\d+) exercises$/, (mins, count) => `${mins} min · ${count} vježbi`],
    [/^(\d+) sets · (.+)$/, (sets, rest) => `${sets} serija · ${rest}`],
    [/^\+(\d+) more$/, count => `+${count} više`],
    [/^(\d+) minutes$/, minutes => `${minutes} minuta`],
    [/^(\d+(?:\.\d+)?) kg since last check-in$/, weight => `${weight} kg od zadnje provjere`],
    [/^(\d+)% completion · (.+)\/10 difficulty · recent feedback$/, (completion, difficulty) => `${completion}% završetka · ${difficulty}/10 težine · nedavne povratne informacije`],
    [/^(\d+) planned minutes · tailored to (.+) level$/, (minutes, level) => `${minutes} planiranih minuta · prilagođeno ${hr[level] || hr[level.charAt(0).toUpperCase() + level.slice(1)] || level} razini`],
    [/^Available (.+)$/, value => `Dostupno ${value}`],
    [/^Schedule session at (.+)$/, time => `Zakaži trening u ${time}`],
    [/^This overlaps with (.+) at (.+)\.$/, (title, time) => `Ovo se preklapa s ${title} u ${time}.`],
    [/^Publish to (.+)$/, label => `Objavi za ${label.replace(/ clients$/, ' klijenata')}`],
    [/^Open (.+)$/, name => `Otvori ${name}`],
    [/^Select (.+)$/, name => `Odaberi ${name}`],
  ];
  for (const [pattern, format] of replacements) {
    const match = value.match(pattern);
    if (match) return format(...match.slice(1));
  }
  return value;
}

const Context = createContext<{ language: Language; setLanguage: (language: Language) => void; t: (value: string) => string }>({ language: 'hr', setLanguage: () => undefined, t: (value) => value });

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(() => (localStorage.getItem('formwork-language') === 'en' ? 'en' : 'hr'));
  const setLanguage = (next: Language) => { localStorage.setItem('formwork-language', next); setLanguageState(next); };
  const t = (value: string) => language === 'hr' ? translateCroatian(value) : Object.entries(hr).find(([, translated]) => translated === value)?.[0] || value;
  useEffect(() => { document.documentElement.lang = language; document.title = language === 'hr' ? 'LetsDoIt · Prostor za trenere' : 'LetsDoIt · Trainer workspace'; }, [language]);
  const value = useMemo(() => ({ language, setLanguage, t }), [language]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export const useLanguage = () => useContext(Context);

/** Localises static interface copy that already exists in reusable components. */
export function useInterfaceTranslation() {
  const { language, t } = useLanguage();
  const textSources = useRef(new WeakMap<Text, { source: string; last: string }>());
  useEffect(() => {
    const apply = (root: Node) => {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      const nodes: Text[] = []; let node: Node | null;
      while ((node = walker.nextNode())) nodes.push(node as Text);
      nodes.forEach((text) => {
        const value = text.nodeValue || ''; const trimmed = value.trim(); if (!trimmed) return;
        const known = textSources.current.get(text);
        const source = !known || known.last !== trimmed ? trimmed : known.source;
        const next = language === 'hr' ? t(source) : source;
        textSources.current.set(text, { source, last: next });
        if (next !== trimmed) text.nodeValue = value.replace(trimmed, next);
      });
      if (root instanceof Element) root.querySelectorAll<HTMLElement>('input[placeholder], textarea[placeholder], [aria-label], [title]').forEach((element) => ['placeholder','aria-label','title'].forEach((attribute) => {
        const value = element.getAttribute(attribute); if (!value) return;
        const sourceKey = `i18nSource${attribute.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())}`;
        const lastKey = `i18nLast${attribute.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())}`;
        const source = element.dataset[lastKey] === value ? element.dataset[sourceKey] || value : value;
        const next = language === 'hr' ? t(source) : source;
        element.dataset[sourceKey] = source; element.dataset[lastKey] = next;
        if (next !== value) element.setAttribute(attribute, next);
      }));
    };
    apply(document.body);
    const observer = new MutationObserver((entries) => entries.forEach((entry) => {
      if (entry.type === 'characterData') apply(entry.target);
      entry.addedNodes.forEach(apply);
    }));
    observer.observe(document.body, { childList: true, characterData: true, subtree: true });
    return () => observer.disconnect();
  }, [language, t]);
}
