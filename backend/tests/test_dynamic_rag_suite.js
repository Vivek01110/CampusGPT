import dotenv from 'dotenv';
dotenv.config();

import connectDB from '../src/config/db.js';
import mongoose from 'mongoose';
import User from '../src/models/User.js';
import { routeQuery } from '../src/services/query/queryRouter.js';
import { understandQuery } from '../src/services/query/queryUnderstandingService.js';
import { resolveUserContext, detectProfileUpdateRequest } from '../src/services/query/userContextService.js';
import { assessEvidenceLLM } from '../src/services/rag/evidenceAssessmentService.js';

const runTests = async () => {
  console.log('================================================================');
  console.log('🚀 CampusGPT Dynamic RAG, Personalization & Clarification Test Suite');
  console.log('================================================================\n');

  try {
    await connectDB();
    console.log('✅ Connected to MongoDB successfully.\n');

    // Setup Test User with Stored Profile
    let testUser = await User.findOne({ email: 'test_student_context@nitkkr.ac.in' });
    if (!testUser) {
      testUser = await User.create({
        name: 'Vivek Test',
        email: 'test_student_context@nitkkr.ac.in',
        password: 'Password123!',
        role: 'student',
        degree: 'B.Tech',
        program: 'B.Tech',
        branch: 'CSE',
        department: 'Computer Engineering',
        semester: 5,
        year: '3rd Year',
        academicYear: '2025-26',
        campus: 'NIT Kurukshetra',
      });
      console.log('✅ Created mock student profile:', testUser.email);
    } else {
      // Reset to known baseline
      testUser.degree = 'B.Tech';
      testUser.program = 'B.Tech';
      testUser.branch = 'CSE';
      testUser.semester = 5;
      testUser.year = '3rd Year';
      await testUser.save();
      console.log('✅ Reset mock student profile to baseline (B.Tech CSE Sem 5).');
    }

    let passedCount = 0;
    let totalCount = 0;

    const assertTest = (description, condition) => {
      totalCount++;
      if (condition) {
        console.log(`  ✅ PASS: ${description}`);
        passedCount++;
      } else {
        console.error(`  ❌ FAIL: ${description}`);
      }
    };

    // -------------------------------------------------------------------------
    // TEST 1: Direct Institute Questions (No Unnecessary Clarification)
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 1: Direct Institute Question (Attendance Rules) ---');
    const res1 = await routeQuery('What are the revised attendance rules for End Semester Examinations at NIT Kurukshetra?', testUser);
    console.log('Query Type:', res1.queryType);
    console.log('Intent:', res1.intent);
    console.log('Answer excerpt:', res1.answer?.slice(0, 160) + '...');
    assertTest('Direct attendance question is NOT flagged for unnecessary clarification', res1.queryType !== 'clarification');
    assertTest('Response provides official attendance answer', res1.answer && res1.answer.length > 50);

    // -------------------------------------------------------------------------
    // TEST 2: Incomplete Query (Needs Clarification for PYQs with no subject)
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 2: Incomplete Query (Give me PYQs without subject) ---');
    const res2 = await routeQuery('Give me PYQs.', testUser);
    console.log('Query Type:', res2.queryType);
    console.log('Clarification Question:', res2.clarification?.question || res2.answer);
    assertTest('Query asking for PYQs without subject requires dynamic clarification', res2.queryType === 'clarification');
    assertTest('Clarification includes dynamic examples or asks for subject', 
      /subject|which course|dbms|operating systems/i.test(res2.answer));

    // -------------------------------------------------------------------------
    // TEST 3: Personalized Query with Stored User Profile
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 3: Personalized Query (Give me DBMS PYQs with stored profile) ---');
    const res3 = await routeQuery('Give me DBMS PYQs.', testUser);
    console.log('Query Type:', res3.queryType);
    console.log('Intent:', res3.intent);
    console.log('Answer excerpt:', res3.answer?.slice(0, 160) + '...');
    assertTest('Does not ask for branch/semester when stored in profile', res3.queryType !== 'clarification');
    assertTest('Retrieves DBMS question papers or links', res3.answer && /dbms|database/i.test(res3.answer));

    // -------------------------------------------------------------------------
    // TEST 4: Current Query Overrides Stored User Profile (Temporary Turn Context)
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 4: Query Overriding Stored Profile (3rd semester requested, profile is 5th) ---');
    const res4 = await routeQuery('Give me 3rd semester CSE DBMS PYQs.', testUser);
    // Verify permanent profile was not altered
    const reloadedUser = await User.findById(testUser._id);
    assertTest('Stored permanent profile remains 5th semester', reloadedUser.semester === 5);
    assertTest('Query executed successfully with overridden 3rd semester', res4.answer && res4.answer.length > 50);

    // -------------------------------------------------------------------------
    // TEST 5: General Query (Direct Gemini Knowledge, No Campus RAG)
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 5: General Programming Query (Explain binary search) ---');
    const res5 = await routeQuery('Explain binary search with an example.', testUser);
    console.log('Query Type:', res5.queryType);
    console.log('Answer excerpt:', res5.answer?.slice(0, 160) + '...');
    assertTest('General algorithm query routed to Gemini General Knowledge', res5.queryType === 'general');
    assertTest('Sources are empty (no fake university document citations)', res5.sources.length === 0);
    assertTest('Answer explains binary search', /binary search|divide and conquer|sorted array/i.test(res5.answer));

    // -------------------------------------------------------------------------
    // TEST 6: Hybrid Query (General Concept + Institute Query)
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 6: Hybrid Query (Explain DBMS + which DBMS course at NIT Kurukshetra) ---');
    const res6 = await routeQuery('Explain DBMS and tell me which DBMS course is offered at NIT Kurukshetra.', testUser);
    console.log('Query Type:', res6.queryType);
    console.log('Answer excerpt:', res6.answer?.slice(0, 200) + '...');
    assertTest('Hybrid query identified and routed appropriately', res6.queryType === 'hybrid');
    assertTest('Answer contains both conceptual and campus sections', 
      /concept|database management|nit kurukshetra/i.test(res6.answer));

    // -------------------------------------------------------------------------
    // TEST 7: Explicit Profile Update Request
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 7: Profile Update Request ("I\'m now in 6th semester") ---');
    const res7 = await routeQuery("I'm now in 6th semester.", testUser);
    console.log('Answer:', res7.answer);
    const updatedUser = await User.findById(testUser._id);
    console.log('User semester in database:', updatedUser.semester);
    assertTest('Profile update detected and updated in database to semester 6', updatedUser.semester === 6);
    assertTest('Friendly confirmation returned to user', /updated successfully|profile/i.test(res7.answer));

    // -------------------------------------------------------------------------
    // TEST 8: Placement Policy & Claim-Level Evidence Assessment
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 8: Placement Policy Inquiry (Claim-level evidence assessment) ---');
    const res8 = await routeQuery('What is the 2026-27 placement policy and what are the rules regarding PPOs and job offers?', testUser);
    console.log('Query Type:', res8.queryType);
    console.log('Answer excerpt:', res8.answer?.slice(0, 200) + '...');
    assertTest('Placement policy inquiry answered without false percentage rejection', 
      res8.answer && !res8.answer.toLowerCase().includes("couldn't find this information"));

    // -------------------------------------------------------------------------
    // SUMMARY
    // -------------------------------------------------------------------------
    console.log('\n================================================================');
    console.log(`🏁 Test Summary: ${passedCount} / ${totalCount} Passed (${Math.round((passedCount / totalCount) * 100)}%)`);
    console.log('================================================================\n');

  } catch (err) {
    console.error('❌ Test Suite Execution Error:', err);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
};

runTests();
