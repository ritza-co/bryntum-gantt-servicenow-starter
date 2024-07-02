import { TaskModel } from '../gantt.module.js';

// Custom event model
export default class CustomTaskModel extends TaskModel {
    static $name = 'CustomTaskModel';

    static fields = [
        { name : 'status', type : 'string', defaultValue : 'red' },
        { name : 'override_status', type : 'boolean', defaultValue : false }
    ];
}