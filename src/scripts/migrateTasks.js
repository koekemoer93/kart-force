import { db } from '../src/firebase';
import { collection, getDocs, addDoc, Timestamp } from 'firebase/firestore';

async function migrate() {
  const tracksSnapshot = await getDocs(collection(db, 'tracks'));
  
  for (let trackDoc of tracksSnapshot.docs) {
    const trackId = trackDoc.id;
    const templatesRef = collection(db, 'tracks', trackId, 'templates');
    const rolesSnapshot = await getDocs(templatesRef);

    for (let roleDoc of rolesSnapshot.docs) {
      const role = roleDoc.id;
      const tasks = roleDoc.data().tasks || [];
      for (let task of tasks) {
        await addDoc(collection(db, 'tasks'), {
          title: task.title,
          description: task.description || '',
          trackId,
          role,
          date: Timestamp.fromDate(new Date()), // today
          completedBy: [],
          createdBy: 'MIGRATION_SCRIPT',
          createdAt: Timestamp.now()
        });
      }
    }
  }
}

migrate().then(() => console.log("Migration complete!"));
