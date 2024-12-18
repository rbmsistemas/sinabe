import React from 'react';
import { Field } from 'formik';
import TextInput from '../../Inputs/TextInput';
import { FaListAlt } from 'react-icons/fa';

const ConditionFormFields = () => {
  return (
    <div className="grid grid-cols-1">
      <Field
        name="name"
        id="name"
        component={TextInput}
        label="Nombre"
        type="text"
        icon={FaListAlt}
        className="col-span-1"
      />
      <Field
        className="hidden"
        name="id"
        label="id"
        component={TextInput}
        type="hidden"
        disabled={true}
      />
    </div>
  );
};

export default ConditionFormFields;
