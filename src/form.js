
//==================================================================================================
//FORM
//==================================================================================================

var Form = (function() {

  return Backbone.View.extend({

    template: _.template('\
      <form class="form-horizontal">\
        <div data-fieldsets></div>\
      </form>\
    '),

    /**
     * @param {Object} [options.schema]
     * @param {Backbone.Model} [options.model]
     * @param {Object} [options.data]
     * @param {String[]|Object[]} [options.fieldsets]
     * @param {String[]} [options.fields]
     * @param {String} [options.idPrefix]
     * @param {Form.Field} [options.Field]
     * @param {Form.Fieldset} [options.Fieldset]
     * @param {Function} [options.template]
     */
    initialize: function(options) {
      var self = this;

      options = options || {};

      //Find the schema to use
      var schemaSource = options.schema 
        || (options.model && options.model.schema) 
        || this.schema
        || {};
      
      var schema = this.schema = _.isFunction(schemaSource) ? schemaSource() : schemaSource;

      //Store important data
      _.extend(this, _.pick(options, 'model', 'data', 'idPrefix'));

      //Override defaults
      _.extend(this, _.pick(options, 'Fieldset', 'Field', 'template'));

      //Check which fields will be included (defaults to all)
      var selectedFields = this.selectedFields = options.fields || _.keys(schema);

      //Create fields
      var fields = this.fields = {};

      _.each(selectedFields, function(key) {
        var fieldSchema = schema[key];
        fields[key] = this.createField(key, fieldSchema);
      }, this);

      //Create fieldsets
      var fieldsetSchema = options.fieldsets || [selectedFields],
          fieldsets = this.fieldsets = [];

      _.each(fieldsetSchema, function(itemSchema) {
        this.fieldsets.push(this.createFieldset(itemSchema));
      }, this);
    },

    render: function() {
      var self = this,
          fields = this.fields;

      //Render form
      var $form = $(this.template(_.result(this, 'templateData')));

      //Render fields into specific containers
      $form.find('[data-fields]').each(function(i, el) {
        var $container = $(el),
            selection = $container.attr('data-fields');

        //Work out which fields to include
        var keys = (selection == '*')
          ? self.selectedFields || _.keys(fields)
          : selection.split(',');

        //Add them
        _.each(keys, function(key) {
          var field = fields[key];

          $container.append(field.render().el);
        });
      });

      //Render fieldsets
      $form.find('[data-fieldsets]').each(function(i, el) {
        var $container = $(el);

        _.each(self.fieldsets, function(fieldset) {
          $container.append(fieldset.render().el);
        });
      });

      //Set the main element
      this.setElement($form);

      return this;
    },

    /**
     * Creates a Fieldset instance
     *
     * @param {String[]|Object[]} schema       Fieldset schema
     *
     * @return {Form.Fieldset}
     */
    createFieldset: function(schema) {
      var options = {
        schema: schema,
        fields: this.fields
      };

      return new Form.Fieldset(options);
    },

    /**
     * Creates a Field instance
     *
     * @param {String} key
     * @param {Object} schema       Field schema
     *
     * @return {Form.Field}
     */
    createField: function(key, schema) {
      var options = {
        form: this,
        key: key,
        schema: schema,
        idPrefix: this.idPrefix
      };

      if (this.model) {
        options.model = this.model;
      } else if (this.data) {
        options.value = this.data[key];
      } else {
        options.value = null;
      }

      return new Form.Field(options);
    },

    /**
     * Validate the data
     *
     * @return {Object}       Validation errors
     */
    validate: function() {
      var self = this,
          fields = this.fields,
          model = this.model,
          errors = {};

      //Collect errors from schema validation
      _.each(fields, function(field) {
        var error = field.validate();
        if (error) {
          errors[field.key] = error;
        }
      });

      //Get errors from default Backbone model validator
      if (model && model.validate) {
        var modelErrors = model.validate(this.getValue());

        if (modelErrors) {
          var isDictionary = _.isObject(modelErrors) && !_.isArray(modelErrors);

          //If errors are not in object form then just store on the error object
          if (!isDictionary) {
            errors._others = errors._others || [];
            errors._others.push(modelErrors);
          }

          //Merge programmatic errors (requires model.validate() to return an object e.g. { fieldKey: 'error' })
          if (isDictionary) {
            _.each(modelErrors, function(val, key) {
              //Set error on field if there isn't one already
              if (fields[key] && !errors[key]) {
                fields[key].setError(val);
                errors[key] = val;
              }

              else {
                //Otherwise add to '_others' key
                errors._others = errors._others || [];
                var tmpErr = {};
                tmpErr[key] = val;
                errors._others.push(tmpErr);
              }
            });
          }
        }
      }

      return _.isEmpty(errors) ? null : errors;
    },

    /**
     * Update the model with all latest values.
     *
     * @param {Object} [options]  Options to pass to Model#set (e.g. { silent: true })
     *
     * @return {Object}  Validation errors
     */
    commit: function(options) {
      //Validate
      var errors = this.validate();
      if (errors) return errors;

      //Commit
      var modelError;

      var setOptions = _.extend({
        error: function(model, e) {
          modelError = e;
        }
      }, options);

      this.model.set(this.getValue(), setOptions);
      
      if (modelError) return modelError;
    },

    /**
     * Get all the field values as an object.
     * Use this method when passing data instead of objects
     *
     * @param {String} [key]    Specific field value to get
     */
    getValue: function(key) {
      //Return only given key if specified
      if (key) return this.fields[key].getValue();

      //Otherwise return entire form
      var values = {};
      _.each(this.fields, function(field) {
        values[field.key] = field.getValue();
      });

      return values;
    },

    /**
     * Update field values, referenced by key
     *
     * @param {Object|String} key     New values to set, or property to set
     * @param val                     Value to set
     */
    setValue: function(prop, val) {
      var data = {};
      if (typeof prop === 'string') {
        data[prop] = val;
      } else {
        data = prop;
      }

      var key;
      for (key in this.schema) {
        if (data[key] !== undefined) {
          this.fields[key].setValue(data[key]);
        }
      }
    },

    /**
     * Returns the editor for a given field key
     *
     * @param {String} key
     *
     * @return {Editor}
     */
    getEditor: function(key) {
      var field = this.fields[key];
      if (!field) throw 'Field not found: '+key;

      return field.editor;
    },

    /**
     * Gives the first editor in the form focus
     */
    focus: function() {
      //Get the first field
      var fieldset = this.fieldsets[0],
          field = fieldset.getFieldAt(0);

      if (!field) return;

      //Set focus
      field.editor.focus();
    },

    /**
     * Removes focus from the currently focused editor
     */
    blur: function() {
      var focusedField = _.find(this.fields, function(field) {
        return field.editor.hasFocus;
      });

      if (focusedField) focusedField.editor.blur();
    },

    /**
     * Override default remove function in order to remove embedded views
     */
    remove: function() {
      _.each(this.fieldsets, function(fieldset) {
        fieldset.remove();
      });

      _.each(this.fields, function(field) {
        field.remove();
      });

      Backbone.View.prototype.remove.call(this);
    }
  });

})();
