import { run } from '../server/db.js';

run(`UPDATE branches SET 
  name = 'CVR Main Campus', 
  city = 'Tangutur', 
  address = 'Near Indian Petrol Station, Kondepi Road, Tangutur, Prakasam Dt., AP 523274', 
  phone = '+91 94402 58592', 
  email = 'info@cvrconventionhall.com', 
  lat = 15.3434, 
  lng = 80.0302 
WHERE id = 1`);

run(`UPDATE halls SET 
  name = 'Grand Kalyana Mandapam (Royal Hall)', 
  tagline = 'Imperial grandeur for auspicious weddings & grand receptions', 
  description = 'Our flagship 12,000 sq.ft pillar-free auditorium designed for spectacular South Indian weddings. Equipped with central chilled-water AC, acoustic sound proofing, 45-foot elevated mandapam stage, royal crystal chandeliers, and polished Italian marble flooring.', 
  min_guests = 200, 
  max_guests = 1500, 
  seating_capacity = 950, 
  dining_capacity = 500, 
  area_sqft = 12000, 
  parking_four = 120, 
  parking_two = 300, 
  image = 'https://images.unsplash.com/photo-1583939003579-730e3918a45a?auto=format&fit=crop&w=1600&q=80' 
WHERE id = 1`);

run(`UPDATE halls SET 
  name = 'Sannidhi Mini AC Banquet Hall', 
  tagline = 'An intimate luxury hall for up to 350 guests', 
  description = 'A warm, elegant mid-size air-conditioned hall perfect for engagements, birthdays, seminars and small receptions, with its own dining area and private entrance.', 
  min_guests = 50, 
  max_guests = 350, 
  seating_capacity = 300, 
  dining_capacity = 200, 
  image = 'https://images.unsplash.com/photo-1511795409834-ef04bbd61622?auto=format&fit=crop&w=1600&q=80' 
WHERE id = 2`);

console.log('Successfully updated CVR details in database');
