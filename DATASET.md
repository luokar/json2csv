### JSON Data Set Sample

The JSON output from different Server APIs can range from simple to highly nested and complex. The examples on this page attempt to illustrate how the JSON Data Set treats specific formats, and gives examples of the different constructor options that allow the user to tweak its behavior. See our [JSON Primer](../../articles/json_primer/json_primer.html) for more information.

*   [Example 1](#Example1) - JSON Array with simple data types as elements.
*   [Example 2](#Example2) - JSON Array with objects as elements
*   [Example 3](#Example3) - JSON Object
*   [Example 4](#Example4) - The "path" constructor option.
*   [Example 5](#Example5) - The "path" constructor option and JSON Array with objects as elements.
*   [Example 6](#Example6) - The "subPaths" constructor option with a single path.
*   [Example 7](#Example7) - The "subPaths" constructor option with multiple paths.
*   [Example 8](#Example8) - "path" constructor option example.
*   [Example 9](#Example9) - Multiple matches for a single sub path.
*   [Example 10](#Example10) - Multiple matches for multiple sub paths.
*   [Example 11](#Example11) - The JSON Nested Data Set.
*   [Example 12](#Example12) - Sorting with the JSON Nested Data Set

Be sure to check out the "[What's Not Supported](#NotSupported)" section.

- - -

#### Example 1

If the JSON data describes an array, and each element of that array is of a basic type (number, string, boolean, or null):

\[ 100, 500, 300, 200, 400 \]

the JSON DataSet will create a row for each element in the JSON array, and store its value in a column named "column0".

var dsExample1 = new Spry.Data.JSONDataSet("../../data/json/array-01.js");

...

<div class="liveSample" spry:region="dsExample1">
	Values from array: <span spry:repeatchildren="dsExample1">{column0} </span>
</div>

Here is a live example:

Values from array: {column0}

- - -

#### Example 2

If the JSON data describes an array, and each element of that array is an object:

\[
	{
		color: "red",
		value: "#f00"
	},
	{
		color: "green",
		value: "#0f0"
	},
	{
		color: "blue",
		value: "#00f"
	},
	{
		color: "cyan",
		value: "#0ff"
	},
	{
		color: "magenta",
		value: "#f0f"
	},
	{
		color: "yellow",
		value: "#ff0"
	},
	{
		color: "black",
		value: "#000"
	}
\]

the JSON Data Set will create a row for each object in the array, and each property on the object will become a column.

var dsExample2 = new Spry.Data.JSONDataSet("../../data/json/array-02.js");  

...

<div class="liveSample" spry:region="dsExample2">
	Values from array: <span spry:repeatchildren="dsExample2">{color}({value}) </span>
</div>

Here's a live example:

Values from array: {color}({value})

  
  

- - -

#### Example 3

If the JSON data describes an object:

{
	color: "red",
	value: "#f00"
}

the JSON Data Set will create a single row for the object, and each property on the object will become a column. The data set will only contain one row of data.

var dsExample3 = new Spry.Data.JSONDataSet("../../data/json/array-03.js");  

...

<div class="liveSample" spry:region="dsExample3">
Values from object: {color}({value})
</div>

Here is a live example:

Values from object: {color}({value})

- - -

#### Example 4

The objects returned from most Server APIs are highly nested:

{
	"id": "0001",
	"type": "donut",
	"name": "Cake",
	"ppu": 0.55,
	"batters":
		{
			"batter":
				\[
					{ "id": "1001", "type": "Regular" },
					{ "id": "1002", "type": "Chocolate" },
					{ "id": "1003", "type": "Blueberry" },
					{ "id": "1004", "type": "Devil's Food" }
				\]
		},
	"topping":
		\[
			{ "id": "5001", "type": "None" },
			{ "id": "5002", "type": "Glazed" },
			{ "id": "5005", "type": "Sugar" },
			{ "id": "5007", "type": "Powdered Sugar" },
			{ "id": "5006", "type": "Chocolate with Sprinkles" },
			{ "id": "5003", "type": "Chocolate" },
			{ "id": "5004", "type": "Maple" }
		\]
}

If the data you want to extract out is not at the top-level of the JSON object, you can tell the JSON data set where to find it by using the "path" constructor option. In this example, we want to extract out all of the "batter" data:

var dsExample4 = new Spry.Data.JSONDataSet("../../data/json/object-02.js", { path: "batters.batter" });

...

<div class="liveSample" spry:region="dsExample4">
<p>Batters:</p>
<ul>
	<li spry:repeat="dsExample4">{type} ({id})</li>
</ul>
</div>

The path is simply the set of properties used to traverse the object's structure, separated by dots. Here's a live example:

Batters:

*   {type} ({id})

- - -

#### Example 5

In the case where you have an array of highly nested objects:

\[
	{
		"id": "0001",
		"type": "donut",
		"name": "Cake",
		"ppu": 0.55,
		"batters":
			{
				"batter":
					\[
						{ "id": "1001", "type": "Regular" },
						{ "id": "1002", "type": "Chocolate" },
						{ "id": "1003", "type": "Blueberry" },
						{ "id": "1004", "type": "Devil's Food" }
					\]
			},
		"topping":
			\[
				{ "id": "5001", "type": "None" },
				{ "id": "5002", "type": "Glazed" },
				{ "id": "5005", "type": "Sugar" },
				{ "id": "5007", "type": "Powdered Sugar" },
				{ "id": "5006", "type": "Chocolate with Sprinkles" },
				{ "id": "5003", "type": "Chocolate" },
				{ "id": "5004", "type": "Maple" }
			\]
	},
	{
		"id": "0002",
		"type": "donut",
		"name": "Raised",
		"ppu": 0.55,
		"batters":
			{
				"batter":
					\[
						{ "id": "1001", "type": "Regular" }
					\]
			},
		"topping":
			\[
				{ "id": "5001", "type": "None" },
				{ "id": "5002", "type": "Glazed" },
				{ "id": "5005", "type": "Sugar" },
				{ "id": "5003", "type": "Chocolate" },
				{ "id": "5004", "type": "Maple" }
			\]
	},
	{
		"id": "0003",
		"type": "donut",
		"name": "Old Fashioned",
		"ppu": 0.55,
		"batters":
			{
				"batter":
					\[
						{ "id": "1001", "type": "Regular" },
						{ "id": "1002", "type": "Chocolate" }
					\]
			},
		"topping":
			\[
				{ "id": "5001", "type": "None" },
				{ "id": "5002", "type": "Glazed" },
				{ "id": "5003", "type": "Chocolate" },
				{ "id": "5004", "type": "Maple" }
			\]
	}
\]

the JSON data set uses the "path" constructor option to extract the matching data out from each object in the array. Each match then becomes a row in the data set. In this example, we want the data set to select all of the "batter" objects and flatten them into rows:

var dsExample5 = new Spry.Data.JSONDataSet("../../data/json/array-03.js", { path: "batters.batter" });  

...

<div class="liveSample" spry:region="dsExample5">
	<p>Batters:</p>
	<ul>
		<li spry:repeat="dsExample5">{type} ({id})</li>
	</ul>
</div>

Here's a live example:

Batters:

*   {type} ({id})

- - -

#### Example 6

Some JSON formats use nested structures to simply group data together. An example of this would be the "image" and "thumbnail" properties in the following example:

{
	"id": "0001",
	"type": "donut",
	"name": "Cake",
	"image":
		{
			"url": "images/0001.jpg",
			"width": 200,
			"height": 200
		},
	"thumbnail":
		{
			"url": "images/thumbnails/0001.jpg",
			"width": 32,
			"height": 32
		}
}

It is sometimes desirable to flatten these structures so they are also available as columns in the data set. You can use the "subPaths" constructor option to tell the JSON Data Set to include these nested structures when it flattens the top-level JSON object, or the data selected by the "path" constructor option. In this particular example, because we have not specified a "path" constructor option, the JSON data set will attempt to flatten the top-level object. Since we want to also include the data from the "image" nested structure, we specify the path to the data which is simply "image".

var dsExample6 = new Spry.Data.JSONDataSet("../../data/json/object-03.js", { subPaths: "image" });

...

<div class="liveSample" spry:region="dsExample6">
<table class="dataTable">
	<tr>
		<th>id</th>
		<th>type</th>
		<th>name</th>
		<th>image.width</th>
		<th>image.height</th>
		<th>image.url</th>
	</tr>
	<tr>
		<td>{id}</td>
		<td>{type}</td>
		<td>{name}</td>
		<td>{image.width}</td>
		<td>{image.height}</td>
		<td>{image.url}</td>
	</tr>
</table>
</div>

The properties within the nested "image" structure are now accessible from within the data set. Notice that the names of the columns are all prefixed by "image.". Here's a live example:

| id  | type | name | image.width | image.height | image.url |
| --- | --- | --- | --- | --- | --- |
| {id} | {type} | {name} | {image.width} | {image.height} | {image.url} |

- - -

#### Example 7

You can specify multiple paths in the "subPaths" constructor option. So if you wanted to include both "image" and "thumbnail" in the flattening process, you simply pass an array of strings:

var dsExample7 = new Spry.Data.JSONDataSet("../../data/json/object-03.js", { subPaths: \[ "image", "thumbnail" \] });

...

<div class="liveSample" spry:region="dsExample7">
	<table class="dataTable">
		<tr>
			<th>id</th>
			<th>type</th>
			<th>name</th>
			<th>image.width</th>
			<th>image.height</th>
			<th>image.url</th>
			<th>thumbnail.width</th>
			<th>thumbnail.height</th>
			<th>thumbnail.url</th>
		</tr>
		<tr>
			<td>{id}</td>
			<td>{type}</td>
			<td>{name}</td>
			<td>{image.width}</td>
			<td>{image.height}</td>
			<td>{image.url}</td>
			<td>{thumbnail.width}</td>
			<td>{thumbnail.height}</td>
			<td>{thumbnail.url}</td>
		</tr>
	</table>
</div>

Here is a live example:

| id  | type | name | image.width | image.height | image.url | thumbnail.width | thumbnail.height | thumbnail.url |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| {id} | {type} | {name} | {image.width} | {image.height} | {image.url} | {thumbnail.width} | {thumbnail.height} | {thumbnail.url} |

- - -

#### Example 8

This example shows the use of the "path" constructor option to extract out the data items. This is nothing different from some of the previous examples, but we will build on this in the next example. An abbreviated version of the JSON data is included here for reference. You can see the full JSON data used by this example [here](../../data/json/donuts.js).

{
	"items":
		{
			"item":
				\[
					{
						"id": "0001",
						"type": "donut",
						"name": "Cake",
						"ppu": 0.55,
						"batters":
							{
								"batter":
									\[
										{ "id": "1001", "type": "Regular" },
										{ "id": "1002", "type": "Chocolate" },
										{ "id": "1003", "type": "Blueberry" },
										{ "id": "1004", "type": "Devil's Food" }
									\]
							},
						"topping":
							\[
								{ "id": "5001", "type": "None" },
								{ "id": "5002", "type": "Glazed" },
								{ "id": "5005", "type": "Sugar" },
								{ "id": "5007", "type": "Powdered Sugar" },
								{ "id": "5006", "type": "Chocolate with Sprinkles" },
								{ "id": "5003", "type": "Chocolate" },
								{ "id": "5004", "type": "Maple" }
							\]
					},

					...

				\]
		}
}

In this example, we are simply going to list the types of items in our JSON object. We are going to use the "path" constructor option to select out all of the "item" objects, and then display the info we get in a table:

var dsExample8 = new Spry.Data.JSONDataSet("../../data/json/donuts.js", { path: "items.item" });

...

<div class="liveSample" spry:region="dsExample8">
	<table class="dataTable">
		<tr>
			<th spry:sort="id">id</th>
			<th spry:sort="type">type</th>
			<th spry:sort="name">name</th>
		</tr>
		<tr spry:repeat="dsExample8">
			<td>{id}</td>
			<td>{type}</td>
			<td>{name}</td>
		</tr>
	</table>
</div>

Using the path "items.item" will result in a data set that has the following columns defined for each row:

| ds\_RowID | id  | type | name | ppu |
| --- | --- | --- | --- | --- |

Here is a live example:

| id  | type | name |
| --- | --- | --- |
| {id} | {type} | {name} |

- - -

#### Example 9

This example builds on [Example 8](#Example8) to show what happens when you select a set of repeating structures with the "subPaths" constructor option.

{
	"items":
		{
			"item":
				\[
					{
						"id": "0001",
						"type": "donut",
						"name": "Cake",
						"ppu": 0.55,
						"batters":
							{
								"batter":
									\[
										{ "id": "1001", "type": "Regular" },
										{ "id": "1002", "type": "Chocolate" },
										{ "id": "1003", "type": "Blueberry" },
										{ "id": "1004", "type": "Devil's Food" }
									\]
							},
						"topping":
							\[
								{ "id": "5001", "type": "None" },
								{ "id": "5002", "type": "Glazed" },
								{ "id": "5005", "type": "Sugar" },
								{ "id": "5007", "type": "Powdered Sugar" },
								{ "id": "5006", "type": "Chocolate with Sprinkles" },
								{ "id": "5003", "type": "Chocolate" },
								{ "id": "5004", "type": "Maple" }
							\]
					},

					...

				\]
		}
}

In this example, we are going to also select the "batter" objects with our "subPaths" constructor option, then display all of our data set rows in a table.

var dsExample9 = new Spry.Data.JSONDataSet("../../data/json/donuts.js", { path: "items.item", subPaths: "batters.batter" });

...

<div class="liveSample" spry:region="dsExample9">
	<table class="dataTable">
		<tr>
			<th spry:sort="id">id</th>
			<th spry:sort="type">type</th>
			<th spry:sort="name">name</th>
			<th spry:sort="batters.batter.type">batter</th>
		</tr>
		<tr spry:repeat="dsExample9">
			<td>{id}</td>
			<td>{type}</td>
			<td>{name}</td>
			<td>{batters.batter.type}</td>
		</tr>
	</table>
</div>

Using the path "items.item" and subPath "batters.batter" will result in a data set that has the following columns defined for each row:

| ds\_RowID | id  | type | name | ppu | batters.batter.id | batters.batter.type |
| --- | --- | --- | --- | --- | --- | --- |

Here is a live example:

| id  | type | name | batter |
| --- | --- | --- | --- |
| {id} | {type} | {name} | {batters.batter.type} |

If you compare the results above against what you see in [Example 8](#Example8), the first thing you will notice is that we now have more rows then we used to. What is basically happening here is that each top-level object matched by the "path" constructor option is merged with any objects that were matched by the paths in the "subPaths" constructor option. If more than one object is matched below a given top-level object, a row is created for every object matched so that its data can be accommodated.

- - -

#### Example 10

This example builds on [Example 9](#Example9) to show what happens when you select another set of repeating structures with the "subPaths" constructor option.

9{
	"items":
		{
			"item":
				\[
					{
						"id": "0001",
						"type": "donut",
						"name": "Cake",
						"ppu": 0.55,
						"batters":
							{
								"batter":
									\[
										{ "id": "1001", "type": "Regular" },
										{ "id": "1002", "type": "Chocolate" },
										{ "id": "1003", "type": "Blueberry" },
										{ "id": "1004", "type": "Devil's Food" }
									\]
							},
						"topping":
							\[
								{ "id": "5001", "type": "None" },
								{ "id": "5002", "type": "Glazed" },
								{ "id": "5005", "type": "Sugar" },
								{ "id": "5007", "type": "Powdered Sugar" },
								{ "id": "5006", "type": "Chocolate with Sprinkles" },
								{ "id": "5003", "type": "Chocolate" },
								{ "id": "5004", "type": "Maple" }
							\]
					},

					...

				\]
		}
}

In this example, we are going to also select the "topping" objects with our "subPaths" constructor option, then display all of our data set rows in a table.

var dsExample10 = new Spry.Data.JSONDataSet("../../data/json/donuts.js", { path: "items.item", subPaths: \[ "batters.batter", "topping" \] });

...

<div class="liveSample" spry:region="dsExample10">
	<table class="dataTable">
		<tr>
			<th spry:sort="id">id</th>
			<th spry:sort="type">type</th>
			<th spry:sort="name">name</th>
			<th spry:sort="batters.batter.type">batter</th>
			<th spry:sort="topping.type">topping</th>
		</tr>
		<tr spry:repeat="dsExample10">
			<td>{id}</td>
			<td>{type}</td>
			<td>{name}</td>
			<td>{batters.batter.type}</td>
			<td>{topping.type}</td>
		</tr>
	</table>
</div>

Using the path "items.item" and sub paths "batters.batter" and "topping", will result in a data set that has the following columns defined for each row:

| ds\_RowID | id  | type | name | ppu | batters.batter.id | batters.batter.type | topping.id | topping.type |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |

Here is a live example:

| id  | type | name | batter | topping |
| --- | --- | --- | --- | --- |
| {id} | {type} | {name} | {batters.batter.type} | {topping.type} |

We get even more rows than we had in [Example 9](#Example9) because the "topping" path also selected multiple objects in some cases. So for every top-level object matched by the "paths" constructor option, we get 'm\*n' rows, where 'm' is the number of matches by the "batters.batter" sub path, and 'n' is the number of matches by the "topping" sub path.

- - -

#### Example 11 - Nested JSON Data Sets

Sometimes you want to work with nested structures, but you don't want to deal with the explosion of rows as shown in [Example 10](#Example10). Imagine you want to show a list of the different types of items, and under each item, you also want to list the different types of batters and toppings available. Doing that with the data set used in [Example 10](#Example10) would require some JavaScript logic embedded in spry attribute conditionals to control when things showed up. A simpler approach would be to use NestedJSONDataSets.

In this example we use the same JSON data used in [Example 10](#Example10), but we will use 2 nested JSON data sets to track the "batter" and "topping" data. Nested data sets are special data sets that stay in sync with the current row of their parent data set. As the current row of the parent data set changes, so does the data inside of the nested data set.

var dsExample11\_Items = new Spry.Data.JSONDataSet("../../data/json/donuts.js", { path: "items.item" });
var dsExample11\_Batters = new Spry.Data.NestedJSONDataSet(dsExample11\_Items, "batters.batter");
var dsExample11\_Toppings = new Spry.Data.NestedJSONDataSet(dsExample11\_Items, "topping");

...

<div class="liveSample" spry:region="dsExample11\_Items dsExample11\_Batters dsExample11\_Toppings">
	<ul>
		<li spry:repeat="dsExample11\_Items">
			{dsExample11\_Items::name}
			<ul>
				<li>Batters:
					<ul>
						<li spry:repeat="dsExample11\_Batters">{dsExample11\_Batters::type}</li>
					</ul>
				</li>
				<li>
					Toppings:
					<ul>
						<li spry:repeat="dsExample11\_Toppings">{dsExample11\_Toppings::type}</li>
					</ul>
				</li>
			</ul>
		</li>
	</ul>
</div>

The other interesting thing about nested data sets is that if their parent data set is used in a spry:repeat or spry:repeatchildren context, any data references from the nested data set are kept in sync with whatever the current row is that is being processed by the loop.

Here is a live example.

*   {dsExample11\_Items::name}
    *   Batters:
        *   {dsExample11\_Batters::type}
    *   Toppings:
        *   {dsExample11\_Toppings::type}

- - -

#### Example 12

Although you can use nested data sets to produce a table that looks like the one in [Example 9](#Example9), there's an important difference. Nested data sets can only sort and filter within groups constrained by the parent's row it is associated with. It is easier to illustrate this with an example. In this example, we have a table that looks like the one in [Example 9](#Example9) on the left side, and on the right side, we have the same data presented as a set of nested lists.

var dsExample12\_Items = new Spry.Data.JSONDataSet("../../data/json/donuts.js", { path: "items.item" });
var dsExample12\_Batters = new Spry.Data.NestedJSONDataSet(dsExample12\_Items, "batters.batter");

...

<div class="liveSample">
	<table>
		<tr>
			<td spry:region="dsExample12\_Items dsExample12\_Batters">
				<table class="dataTable">
					<tr>
						<th spry:sort="dsExample12\_Items id">id</th>
						<th spry:sort="dsExample12\_Items type">type</th>
						<th spry:sort="dsExample12\_Items name">name</th>
						<th spry:sort="dsExample12\_Batters type">batter</th>
					</tr>
					<tbody spry:repeatchildren="dsExample12\_Items">
						<tr spry:repeat="dsExample12\_Batters">
							<td>{dsExample12\_Items::id}</td>
							<td>{dsExample12\_Items::type}</td>
							<td>{dsExample12\_Items::name}</td>
							<td>{dsExample12\_Batters::type}</td>
						</tr>
					</tbody>
				</table>
			</td>
			<td spry:region="dsExample12\_Items dsExample12\_Batters">
				<ul>
					<li spry:repeat="dsExample12\_Items">
						{dsExample12\_Items::name}
						<ul>
							<li>Batters:
								<ul>
									<li spry:repeat="dsExample12\_Batters">{dsExample12\_Batters::type}</li>
								</ul>
							</li>
						</ul>
					</li>
				</ul>
			</td>
		</tr>
	</table>
</div>

Here's the live example:

| id  | type | name | batter |
| --- | --- | --- | --- |
| {dsExample12\_Items::id} | {dsExample12\_Items::type} | {dsExample12\_Items::name} | {dsExample12\_Batters::type} |

*   {dsExample12\_Items::name}
    *   Batters:
        *   {dsExample12\_Batters::type}

Notice that when you sort any column associated with the parent data set, all of the rows in the table shift around, whereas when you click on the batter column, it seems as if only the data in the batter column is moving around. If you look at what happens in the list on the right as you sort, it becomes more apparent what is happening.

- - -

#### What is not yet supported:

*   Arrays of arrays.
*   Arrays that contain elements of different types. Example: \[ 100, { "foo": "bar" }, true, null \]