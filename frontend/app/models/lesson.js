import DS from 'ember-data';
const { Model, attr, belongsTo, hasMany } = DS;

export default class LessonModel extends Model {
  @attr() name;
  @attr() slug;
  @attr() description;
  @attr() status;
  @attr() percentage;
  @belongsTo('user') creator;
  @hasMany('module') modules;
  @hasMany('chapter') chapters;
}
