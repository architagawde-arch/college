require('dotenv').config();
const { Sequelize, DataTypes: D } = require('sequelize');
const sequelize = new Sequelize(process.env.DB_NAME||'cfms', process.env.DB_USER||'root', process.env.DB_PASS||'', { host: process.env.DB_HOST||'localhost', dialect:'mysql', logging:false });
const pk = () => ({ type: D.INTEGER, primaryKey:true, autoIncrement:true });
const req = (t,x={}) => ({ type:t, allowNull:false, ...x });
const def = (n,t,a) => sequelize.define(n,a,{ tableName:t, timestamps:false });
const email = { type:D.STRING(120), allowNull:false, unique:true, validate:{ isEmail:true } };

const Department = def('Department','departments',{ department_id:pk(), department_name:req(D.STRING(100),{unique:true}) });
const Programme = def('Programme','programmes',{ program_id:pk(), program_name:req(D.STRING(100)), dept_id:req(D.INTEGER) });
const Faculty = def('Faculty','faculty',{ faculty_id:pk(), faculty_name:req(D.STRING(100)), dept_id:req(D.INTEGER), email, designation:D.STRING(80) });
const Batch = def('Batch','batches',{ batch_id:pk(), batch_name:req(D.STRING(80)), academic_year:req(D.STRING(20)), semester:req(D.INTEGER,{validate:{min:1,max:8}}), program_id:req(D.INTEGER), faculty_id:D.INTEGER });
const Student = def('Student','students',{ student_id:pk(), roll_no:req(D.STRING(30),{unique:true}), student_name:req(D.STRING(100)), email });
const Enrollment = def('Enrollment','enrollments',{ enrollment_id:pk(), student_id:req(D.INTEGER), batch_id:req(D.INTEGER), status:{type:D.ENUM('Active','Inactive'),defaultValue:'Active'} });
const Course = def('Course','courses',{ course_id:pk(), course_code:req(D.STRING(20),{unique:true}), course_name:req(D.STRING(120)), credits:req(D.INTEGER,{validate:{min:1,max:10}}), semester:req(D.INTEGER) });
const Offering = def('Offering','course_offerings',{ offering_id:pk(), course_id:req(D.INTEGER), faculty_id:req(D.INTEGER), batch_id:req(D.INTEGER), academic_year:D.STRING(20), semester:D.INTEGER });
const FType = def('FType','types_of_feedback',{ type_id:pk(), type_name:req(D.STRING(60),{unique:true}) });
const Facility = def('Facility','facilities',{ facility_id:pk(), facility_name:req(D.STRING(60),{unique:true}) });
const Form = def('Form','feedback_forms',{ feedback_id:pk(), offering_id:D.INTEGER, feedback_title:req(D.STRING(150)), description:D.TEXT, start_date:req(D.DATEONLY), end_date:req(D.DATEONLY), deadline:D.DATE, status:{type:D.ENUM('Draft','Published','Closed'),defaultValue:'Draft'}, feedback_types:D.STRING(60), audience_type:{type:D.ENUM('Student','Faculty','All'),defaultValue:'Student'}, sub_type:D.STRING(60), is_anonymous:{type:D.BOOLEAN,defaultValue:true}, created_by:D.INTEGER, created_at:{type:D.DATE,defaultValue:D.NOW} });
const Question = def('Question','feedback_questions',{ question_id:pk(), feedback_id:req(D.INTEGER), question_text:req(D.STRING(300)), question_type:req(D.ENUM('Rating','Text','Yes/No','Multiple Choice')), question_number:req(D.INTEGER), options:D.STRING(500) });
const Response = def('Response','feedback_responses',{ response_id:pk(), feedback_id:req(D.INTEGER), question_id:req(D.INTEGER), student_id:D.INTEGER, answer:D.TEXT, submitted_date:{type:D.DATE,defaultValue:D.NOW}, faculty_id:D.INTEGER, respondent_type:req(D.ENUM('Student','Faculty')) });
const Staff = def('Staff','staff',{ staff_id:pk(), staff_name:req(D.STRING(100)), dept_id:D.INTEGER, email, designation:D.STRING(80), status:{type:D.ENUM('Active','Inactive'),defaultValue:'Active'} });
const ModLog = def('ModLog','moderation_log',{ log_id:pk(), feedback_id:D.INTEGER, question_id:D.INTEGER, respondent_type:D.STRING(10), level:D.STRING(10), kind:D.STRING(20), words:D.STRING(300), created_at:{type:D.DATE,defaultValue:D.NOW} });
const User = def('User','users',{ user_id:pk(), full_name:req(D.STRING(100)), email, password_hash:req(D.STRING(100)), role:req(D.ENUM('Admin','Faculty','Student')), ref_id:D.INTEGER, status:{type:D.ENUM('Active','Inactive'),defaultValue:'Active'}, created_at:{type:D.DATE,defaultValue:D.NOW} });

// Associations: 1:M and M:N (Student <-> Batch through Enrollment)
Department.hasMany(Programme,{foreignKey:'dept_id'}); Programme.belongsTo(Department,{foreignKey:'dept_id'});
Department.hasMany(Faculty,{foreignKey:'dept_id'}); Faculty.belongsTo(Department,{foreignKey:'dept_id'});
Faculty.hasMany(Batch,{foreignKey:'faculty_id'}); Batch.belongsTo(Faculty,{foreignKey:'faculty_id'});
Programme.hasMany(Batch,{foreignKey:'program_id'}); Batch.belongsTo(Programme,{foreignKey:'program_id'});
Student.belongsToMany(Batch,{through:Enrollment,foreignKey:'student_id',otherKey:'batch_id'});
Batch.belongsToMany(Student,{through:Enrollment,foreignKey:'batch_id',otherKey:'student_id'});
Course.hasMany(Offering,{foreignKey:'course_id'}); Offering.belongsTo(Course,{foreignKey:'course_id'});
Faculty.hasMany(Offering,{foreignKey:'faculty_id'}); Offering.belongsTo(Faculty,{foreignKey:'faculty_id'});
Batch.hasMany(Offering,{foreignKey:'batch_id'}); Offering.belongsTo(Batch,{foreignKey:'batch_id'});
Offering.hasMany(Form,{foreignKey:'offering_id'}); Form.belongsTo(Offering,{foreignKey:'offering_id'});
Form.hasMany(Question,{foreignKey:'feedback_id',onDelete:'CASCADE'}); Question.belongsTo(Form,{foreignKey:'feedback_id'});
Form.hasMany(Response,{foreignKey:'feedback_id',onDelete:'CASCADE'}); Question.hasMany(Response,{foreignKey:'question_id',onDelete:'CASCADE'});
Student.hasMany(Response,{foreignKey:'student_id'});

const M = { departments:[Department,'department_id'], programmes:[Programme,'program_id'], faculty:[Faculty,'faculty_id'], batches:[Batch,'batch_id'], students:[Student,'student_id'], enrollments:[Enrollment,'enrollment_id'], courses:[Course,'course_id'], offerings:[Offering,'offering_id'], types:[FType,'type_id'], facilities:[Facility,'facility_id'], staff:[Staff,'staff_id'] };
module.exports = { sequelize, M, Department,Programme,Faculty,Batch,Student,Enrollment,Course,Offering,FType,Facility,Form,Question,Response,User,Staff,ModLog };
