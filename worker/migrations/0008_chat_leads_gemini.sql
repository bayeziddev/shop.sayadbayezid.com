-- Chat assistant that always gives the contact number and collects leads; Gemini for chat now that the key is set.
-- Each change applies only where the owner has not edited the value (so admin edits are never overwritten).

-- The chat used the Workers AI default. GEMINI_API_KEY is now synced, so chat answers with Gemini (better Bangla);
-- if Gemini ever fails, the Worker falls back to Workers AI automatically. Change it any time in Admin → এআই সেটিংস.
UPDATE ai_provider_configs SET provider = 'gemini', model = 'gemini-2.5-flash', secret_name = 'GEMINI_API_KEY'
WHERE purpose = 'chat' AND provider = 'workers_ai' AND model = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';

UPDATE ai_provider_configs SET system_prompt = 'তুমি এই ওয়েবসাইটের বিক্রয় সহায়ক। নিচে দেওয়া প্যাকেজ, দাম, প্রশ্নোত্তর, কাজের ধাপ ও যোগাযোগের তথ্য থেকে বাংলায় উত্তর দেবে। ভিজিটর যোগাযোগের নম্বর চাইলে সাথে সাথে হোয়াটসঅ্যাপ নম্বর দেবে, আর তার নাম ও হোয়াটসঅ্যাপ নম্বর চেয়ে নেবে যাতে টিম ফ্রি পরামর্শ দিতে পারে। নিশ্চিত না হলে অনুমান করবে না।' WHERE purpose = 'chat' AND system_prompt = 'তুমি এই ওয়েবসাইটের সহায়ক। শুধু নিচে দেওয়া প্যাকেজ, দাম, প্রশ্নোত্তর ও কাজের ধাপ থেকে উত্তর দেবে, সবসময় বাংলায়। নিশ্চিত না হলে অনুমান করবে না।';
UPDATE chat_settings SET greeting = 'আসসালামু আলাইকুম! কোন ব্যবসার জন্য ওয়েবসাইট খুঁজছেন? প্যাকেজ, দাম, লাইভ ডেমো — যা জানতে চান লিখুন। চাইলে আপনার হোয়াটসঅ্যাপ নম্বর দিন, আমাদের টিম ফ্রি পরামর্শ দেবে।' WHERE id = 1 AND greeting = 'আসসালামু আলাইকুম! কোন ধরনের ওয়েবসাইট খুঁজছেন? প্যাকেজ, দাম বা কাজের ধাপ — যা জানতে চান জিজ্ঞেস করুন।';
UPDATE chat_settings SET escalation_message = 'এই প্রশ্নের নিশ্চিত উত্তর আমাদের টিম দেবে — নিচে আপনার নাম ও হোয়াটসঅ্যাপ নম্বর দিন, আমরা শীঘ্রই যোগাযোগ করব।' WHERE id = 1 AND escalation_message = 'এই প্রশ্নের নিশ্চিত উত্তর দিতে আমাদের একজন প্রতিনিধি আপনার সাথে যোগাযোগ করবেন। অনুগ্রহ করে আপনার নাম ও ফোন নম্বর দিন।';
